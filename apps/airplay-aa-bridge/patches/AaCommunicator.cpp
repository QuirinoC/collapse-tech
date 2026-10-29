// Distributed under GPLv3 only as specified in repository's root LICENSE file

#include "AaCommunicator.h"
#include "Channel.pb.h"
#include "ChannelOpenRequest.pb.h"
#include "Configuration.h"
#include "DefaultChannelHandler.h"
#include "FfsFunction.h"
#include "InputChannelHandler.h"
#include "MediaStreamType.pb.h"
#include "Message.h"
#include "PingRequest.pb.h"
#include "PingResponse.pb.h"
#include "ServiceDiscoveryRequest.pb.h"
#include "ServiceDiscoveryResponse.pb.h"
#include "Udc.h"
#include "VideoChannelHandler.h"
#include "VideoChannelDescriptor.h"
#include "descriptors.h"
#include "utils.h"
#include <boost/filesystem.hpp>
#include <boost/signals2.hpp>
#include <cstdint>
#include <fcntl.h>
#include <fmt/core.h>
#include <iostream>
#include <linux/usb/functionfs.h>
#include <openssl/err.h>
#include <openssl/ssl.h>
#include <pcap/pcap.h>
#include <stdexcept>

#define CRT_FILE "android_auto.crt"
#define PRIVKEY_FILE "android_auto.key"
#define DHPARAM_FILE "dhparam.pem"

using namespace std;
using namespace boost::filesystem;
using namespace tag::aas;

void AaCommunicator::logMessage(const Message &msg, bool direction) {
  if (!pdumper)
    return;
  int pktSize = 8 + msg.content.size();
  uint8_t buffer[pktSize];
  buffer[0] = 0;
  buffer[1] = 0;
  buffer[2] = 0;
  buffer[3] = 0;
  buffer[4] = msg.channel;
  buffer[5] = msg.flags;
  buffer[6] = direction ? 1 : 0;
  buffer[7] = 0;
  copy(msg.content.begin(), msg.content.end(), buffer + 8);
  struct pcap_pkthdr packet_header;
  gettimeofday(&packet_header.ts, NULL);
  packet_header.caplen = pktSize;
  packet_header.len = pktSize;
  pcap_dump((unsigned char *)pdumper, &packet_header, buffer);
}

void AaCommunicator::sendMessage(uint8_t channel, uint8_t flags,
                                 const std::vector<uint8_t> &buf) {
  Message msg;
  msg.channel = channel;
  msg.flags = flags;
  msg.content = buf;
  logMessage(msg, true);
  {
    std::unique_lock<std::mutex> lk(sendQueueMutex);
    sendQueue.push_back(msg);
  }
  sendQueueNotEmpty.notify_all();
}

void AaCommunicator::sendVersionResponse(__u16 major, __u16 minor) {
  std::vector<uint8_t> msg;
  pushBackInt16(msg, MessageType::VersionResponse);
  pushBackInt16(msg, major);
  pushBackInt16(msg, minor);
  // 0 => version match
  pushBackInt16(msg, 0);
  sendMessage(0, EncryptionType::Plain | FrameType::Bulk, msg);
}

void AaCommunicator::handleVersionRequest(const void *buf, size_t nbytes) {
  if (nbytes < 4)
    throw std::runtime_error("short AA version request");
  const __u16 *shortView = (const __u16 *)buf;
  auto versionMajor = be16_to_cpu(shortView[0]);
  auto versionMinor = be16_to_cpu(shortView[1]);
  if (versionMajor == 1)
    sendVersionResponse(1, 5);
  else
    throw std::runtime_error("unsupported version");
}

void AaCommunicator::sendServiceDiscoveryRequest() {
  class ServiceDiscoveryRequest sdr;
  sdr.set_manufacturer("TAG");
  sdr.set_model("AAServer");
  auto msgString = sdr.SerializeAsString();
  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MessageType::ServiceDiscoveryRequest);
  std::copy(msgString.begin(), msgString.end(), std::back_inserter(plainMsg));
  sendMessage(0, EncryptionType::Encrypted | FrameType::Bulk, plainMsg);
}

void AaCommunicator::handleServiceDiscoveryResponse(const void *buf,
                                                    size_t nbytes) {
  serviceDescriptor = vector<uint8_t>((uint8_t *)buf, (uint8_t *)buf + nbytes);
  class tag::aas::ServiceDiscoveryResponse sdr;
  if (!sdr.ParseFromArray(buf, nbytes))
    throw std::runtime_error("invalid service discovery response");
  std::cout << sdr.DebugString() << std::endl;
  for (auto ch : sdr.channels()) {
    if (ch.has_media_channel() &&
        airplay_aa::isH264VideoChannel(ch.media_channel())) {
      channelTypeToChannelNumber[ChannelType::Video] = ch.channel_id();
      channelHandlers[ch.channel_id()] =
          new VideoChannelHandler(ch.channel_id());
    } else if (ch.has_input_channel()) {
      channelTypeToChannelNumber[ChannelType::Input] = ch.channel_id();
      auto available_buttons = ch.input_channel().available_buttons();
      channelHandlers[ch.channel_id()] =
          new InputChannelHandler(ch.channel_id(), {available_buttons.begin(),
                                                    available_buttons.end()});
    } else {
      channelHandlers[ch.channel_id()] =
          new DefaultChannelHandler(ch.channel_id());
    }
    channelHandlers[ch.channel_id()]->sendToClient.connect(
        [this](int clientId, uint8_t channelNumber, bool specific,
               std::vector<uint8_t> data) {
          gotMessage(clientId, channelNumber, specific, data);
        });
    channelHandlers[ch.channel_id()]->sendToHeadunit.connect(
        [this](uint8_t channelNumber, uint8_t flags,
               std::vector<uint8_t> data) {
          sendMessage(channelNumber, flags, data);
        });
  }
}

uint8_t AaCommunicator::getChannelNumberByChannelType(ChannelType ct) {
  auto channelId = channelTypeToChannelNumber[ct];
  if (channelId < 0) {
    throw runtime_error("Invalid channelId");
  }
  return channelId;
}

void AaCommunicator::handleChannelMessage(const Message &message) {
  auto msg = message.content;
  const __u16 *shortView = (const __u16 *)(msg.data());
  auto messageType = be16_to_cpu(shortView[0]);
  {
    std::unique_lock<std::mutex> lk(m);
    if (message.channel != 0) {
      if (!this->channelHandlers[message.channel])
        throw std::runtime_error("AA message on an undiscovered channel");
      auto handled =
          this->channelHandlers[message.channel]->handleMessageFromHeadunit(
              message);
      if (!handled) {
        throw aa_runtime_error(
            fmt::format("Unknown packet on channel {0} with message type {1}",
                        to_string(message.channel), to_string(messageType)));
      }
    } else {
      gotMessage(-1, message.channel,
                 message.flags & MessageTypeFlags::Specific, msg);
    }
  }
  cv.notify_all();
}

void AaCommunicator::sendToChannel(int clientId, uint8_t channelNumber,
                                   bool specific, const vector<uint8_t> &data) {
  if (channelHandlers[channelNumber] == nullptr) {
    throw std::runtime_error("No handler for channel " +
                             to_string(channelNumber));
  }
  channelHandlers[channelNumber]->handleMessageFromClient(
      clientId, channelNumber, specific, data);
}

void AaCommunicator::disconnected(int clientId) {
  for (auto ch : channelHandlers) {
    if (ch)
      ch->disconnected(clientId);
  }
}

std::vector<uint8_t> AaCommunicator::getServiceDescriptor() {
  return serviceDescriptor;
}

std::vector<uint8_t>
AaCommunicator::decryptMessage(const std::vector<uint8_t> &encryptedMsg) {
  std::lock_guard<std::mutex> sslLock(sslMutex);
  if (!ssl || !SSL_is_init_finished(ssl))
    throw std::runtime_error("Encrypted AA frame arrived before TLS was ready");
  ERR_clear_error();

  auto bytesWritten =
      BIO_write(readBio, encryptedMsg.data(), encryptedMsg.size());
  if (bytesWritten != static_cast<int>(encryptedMsg.size())) {
    throw std::runtime_error("BIO_write failed");
  }
  std::vector<uint8_t> plain;
  char buffer[16 * 1024];
  // One AA frame can contain several TLS records. Drain all of them before
  // assigning the next AA frame's channel/flags to any decrypted bytes.
  do {
    const auto ret = SSL_read(ssl, buffer, sizeof buffer);
    if (ret <= 0) {
      const auto err = SSL_get_error(ssl, ret);
      throw std::runtime_error("SSL_read failed: " + std::to_string(ret) +
                               " " + std::to_string(err));
    }
    plain.insert(plain.end(), buffer, buffer + ret);
    if (plain.size() > airplay_aa::AaFrameReceiver::MaxMessageSize)
      throw std::runtime_error("AA TLS plaintext exceeds message limit");
  } while (SSL_pending(ssl) > 0 || SSL_has_pending(ssl) || BIO_ctrl_pending(readBio) > 0);
  return plain;
}

void AaCommunicator::handleMessageContent(const Message &message) {
  if (message.content.size() < 2)
    throw std::runtime_error("AA message is missing its type");
  logMessage(message, false);
  auto msg = message.content;
  const __u16 *shortView = (const __u16 *)msg.data();
  MessageType messageType = (MessageType)be16_to_cpu(shortView[0]);
  if (message.channel != 0) {
    handleChannelMessage(message);
  } else if (messageType == MessageType::AudioFocusResponse) {
    handleChannelMessage(message);
  } else if (messageType == MessageType::NavigationFocusResponse) {
    handleChannelMessage(message);
  } else if (messageType == MessageType::VersionRequest) {
    cout << "got version request" << endl;
    handleVersionRequest(shortView + 1, msg.size() - sizeof(__u16));
    cout << "version negotiation ok" << endl;
  } else if (messageType == MessageType::SslHandshake) {
    handleSslHandshake(shortView + 1, msg.size() - sizeof(__u16));
  } else if (messageType == MessageType::AuthComplete) {
    cout << "auth complete" << endl;
    sendServiceDiscoveryRequest();
  } else if (messageType == MessageType::ServiceDiscoveryResponse) {
    cout << "got service discovery response" << endl;
    handleServiceDiscoveryResponse(shortView + 1, msg.size() - sizeof(__u16));
  } else if (messageType == MessageType::PingRequest) {
    cout << "got ping request" << endl;
    handlePingRequest(shortView + 1, msg.size() - sizeof(__u16));
  } else {
    throw std::runtime_error("Unhandled message type: " +
                             std::to_string(messageType));
  }
}

void AaCommunicator::handlePingRequest(const void *buf, size_t nbytes) {
  class tag::aas::PingRequest preq;
  preq.ParseFromArray(buf, nbytes);
  std::cout << preq.DebugString() << std::endl;

  tag::aas::PingResponse presp;
  presp.set_timestamp(preq.timestamp());
  int bufSize = presp.ByteSize();
  uint8_t buffer[bufSize];
  if (!presp.SerializeToArray(buffer, bufSize))
    throw aa_runtime_error("presp.SerializeToArray failed");

  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MessageType::PingResponse);
  copy(buffer, buffer + bufSize, std::back_inserter(plainMsg));
  sendMessage(0, EncryptionType::Encrypted | FrameType::Bulk, plainMsg);
}

void AaCommunicator::handleSslHandshake(const void *buf, size_t nbytes) {
  std::vector<uint8_t> msg;
  pushBackInt16(msg, MessageType::SslHandshake);
  {
    std::lock_guard<std::mutex> sslLock(sslMutex);
    initializeSsl();
    if (BIO_write(readBio, buf, nbytes) != static_cast<int>(nbytes))
      throw runtime_error("TLS handshake BIO_write failed");

    ERR_clear_error();
    auto ret = SSL_accept(ssl);
    if (ret <= 0) {
      auto error = SSL_get_error(ssl, ret);
      if (error != SSL_ERROR_WANT_READ)
        throw runtime_error("SSL_accept failed: " + to_string(error));
    }

    char buffer[512];
    while (BIO_ctrl_pending(writeBio) != 0) {
      auto len = BIO_read(writeBio, buffer, sizeof buffer);
      if (len <= 0)
        throw runtime_error("TLS handshake BIO_read failed");
      std::copy(buffer, buffer + len, std::back_inserter(msg));
    }
  }
  // Channel callbacks/enqueueing must not run under sslMutex.
  sendMessage(0, EncryptionType::Plain | FrameType::Bulk, msg);
}

void AaCommunicator::initializeSsl() {
  // Caller holds sslMutex; SSL_set_bio transfers ownership of both BIOs.
  if (ssl)
    return;
  ssl = SSL_new(ctx);
  readBio = BIO_new(BIO_s_mem());
  writeBio = BIO_new(BIO_s_mem());
  SSL_set_accept_state(ssl);
  SSL_set_bio(ssl, readBio, writeBio);
}

void AaCommunicator::initializeSslContext() {
  SSL_load_error_strings();
  OpenSSL_add_ssl_algorithms();
  const SSL_METHOD *method = SSLv23_server_method();

  ctx = SSL_CTX_new(method);
  if (!ctx) {
    throw std::runtime_error("Error while creating SSL context");
  }

  SSL_CTX_set_ecdh_auto(ctx, 1);
  if (SSL_CTX_use_certificate_file(ctx, CRT_FILE, SSL_FILETYPE_PEM) <= 0) {
    throw std::runtime_error("Error on SSL_CTX_use_certificate_file");
  }

  if (SSL_CTX_use_PrivateKey_file(ctx, PRIVKEY_FILE, SSL_FILETYPE_PEM) <= 0) {
    throw std::runtime_error("Error on SSL_CTX_use_PrivateKey_file");
  }

  DH *dh_2048 = NULL;
  FILE *paramfile = fopen(DHPARAM_FILE, "r");
  if (paramfile) {
    dh_2048 = PEM_read_DHparams(paramfile, NULL, NULL, NULL);
    fclose(paramfile);
  } else {
    throw std::runtime_error("Cannot read DH parameters file");
  }
  if (dh_2048 == NULL) {
    throw std::runtime_error("Reading DH parameters failed");
  }
  if (SSL_CTX_set_tmp_dh(ctx, dh_2048) != 1) {
    throw std::runtime_error("SSL_CTX_set_tmp_dh failed");
  }
  SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, &AaCommunicator::verifyCertificate);
  SSL_CTX_set_options(ctx, SSL_OP_NO_TLSv1_3);
}

int AaCommunicator::verifyCertificate(int preverify_ok,
                                      X509_STORE_CTX *x509_ctx) {
  return 1;
}

ssize_t AaCommunicator::handleMessage(int fd, const void *buf, size_t nbytes) {
  incomingFrames.consume(buf, nbytes,
      [this](const std::vector<uint8_t> &ciphertext) { return decryptMessage(ciphertext); },
      [this](uint8_t channel, uint8_t flags, const std::vector<uint8_t> &payload) {
        Message message;
        message.channel = channel;
        message.flags = flags;
        message.content = payload;
        handleMessageContent(message);
      });
  return nbytes;
}

ssize_t AaCommunicator::getMessage(int fd, void *buf, size_t nbytes) {
  std::lock_guard<std::mutex> outboundLock(outboundMutex);
  Message msg;
  {
    std::unique_lock<std::mutex> queueLock(sendQueueMutex);
    if (!sendQueueNotEmpty.wait_for(queueLock, 1s, [this] {
          return threadFinished.load() || !sendQueue.empty();
        }) || threadFinished.load()) {
      errno = EINTR;
      return 0;
    }
    msg = sendQueue.front();
  }

  if (!(msg.flags & EncryptionType::Encrypted)) {
    const auto length = msg.content.size();
    if (length > UINT16_MAX || nbytes < length + 4)
      throw runtime_error("Plain AA frame exceeds output buffer");
    auto output = static_cast<uint8_t *>(buf);
    output[0] = msg.channel;
    output[1] = msg.flags;
    output[2] = length >> 8;
    output[3] = length & 0xff;
    std::copy(msg.content.begin(), msg.content.end(), output + 4);
    std::lock_guard<std::mutex> queueLock(sendQueueMutex);
    sendQueue.pop_front();
    return length + 4;
  }

  // Preserve the existing 2000-byte plaintext fragmentation and AA headers.
  const size_t maxSize = 2000;
  const auto remaining = msg.content.size() - msg.offset;
  const auto fragmentLength = std::min(remaining, maxSize);
  auto flags = msg.flags;
  const bool finalFragment = remaining <= maxSize;
  if (!finalFragment && (flags & FrameType::Bulk))
    flags = (flags & ~FrameType::Bulk) | FrameType::First;
  else if (finalFragment && !(flags & FrameType::Bulk))
    flags |= FrameType::Last;
  const size_t headerLength =
      (flags & FrameType::Bulk) == FrameType::First ? 8 : 4;
  if (fragmentLength == 0 || nbytes <= headerLength)
    throw runtime_error("Invalid encrypted AA frame or output buffer");

  auto output = static_cast<uint8_t *>(buf);
  size_t encryptedLength;
  {
    std::lock_guard<std::mutex> sslLock(sslMutex);
    if (!ssl || BIO_ctrl_pending(writeBio) != 0)
      throw runtime_error("TLS is not ready or has undrained output");
    ERR_clear_error();
    const auto accepted = SSL_write(ssl, msg.content.data() + msg.offset,
                                    fragmentLength);
    if (accepted <= 0) {
      // SSL_get_error must immediately follow the failed call on this thread.
      const auto error = SSL_get_error(ssl, accepted);
      throw runtime_error("SSL_write failed: " + to_string(accepted) +
                          " " + to_string(error));
    }
    if (static_cast<size_t>(accepted) != fragmentLength)
      throw runtime_error("SSL_write accepted incomplete AA plaintext");
    encryptedLength = BIO_ctrl_pending(writeBio);
    if (encryptedLength == 0 || encryptedLength > UINT16_MAX ||
        encryptedLength > nbytes - headerLength)
      throw runtime_error("TLS ciphertext exceeds AA output buffer or is empty");
    const auto drained = BIO_read(writeBio, output + headerLength,
                                 encryptedLength);
    if (drained != static_cast<int>(encryptedLength) ||
        BIO_ctrl_pending(writeBio) != 0)
      throw runtime_error("TLS ciphertext drain was incomplete");
  }

  output[0] = msg.channel;
  output[1] = flags;
  output[2] = encryptedLength >> 8;
  output[3] = encryptedLength & 0xff;
  if (headerLength == 8) {
    const uint32_t totalLength = msg.content.size();
    output[4] = totalLength >> 24;
    output[5] = (totalLength >> 16) & 0xff;
    output[6] = (totalLength >> 8) & 0xff;
    output[7] = totalLength & 0xff;
  }
  // Neither SSL nor its BIOs are held while changing/enqueueing the queue.
  // A failed encryption aborts the session without consuming this fragment.
  {
    std::lock_guard<std::mutex> queueLock(sendQueueMutex);
    if (finalFragment)
      sendQueue.pop_front();
    else {
      sendQueue.front().flags = flags & ~FrameType::Bulk;
      sendQueue.front().offset += fragmentLength;
    }
  }
  return encryptedLength + headerLength;
}

ssize_t AaCommunicator::handleEp0Message(int fd, const void *buf,
                                         size_t nbytes) {
  const usb_functionfs_event *event = (const usb_functionfs_event *)buf;
  for (size_t n = nbytes / sizeof *event; n; --n, ++event) {
    std::cout << "ep0 event " << (int)event->type << " " << std::endl;
    if (event->type == FUNCTIONFS_ENABLE) {
      usbEndpoints.enable();
    } else if (event->type == FUNCTIONFS_DISABLE) {
      if (usbEndpoints.disable())
        throw std::runtime_error("ep0 disable after session bytes");
    } else if (event->type == FUNCTIONFS_UNBIND) {
      usbEndpoints.unbind();
      throw std::runtime_error("ep0 unbind");
    } else if (event->type == FUNCTIONFS_SUSPEND) {
      if (usbEndpoints.suspend())
        throw std::runtime_error("ep0 suspend after session bytes");
      std::cout << "USB startup suspended: retaining configured state until RESUME or newer FUNCTIONFS_ENABLE" << std::endl;
    } else if (event->type == FUNCTIONFS_RESUME) {
      usbEndpoints.resume();
      std::cout << "USB resumed: waiting for actual FUNCTIONFS_ENABLE if configuration was invalidated" << std::endl;
    }
  }
  return nbytes;
}

AaCommunicator::AaCommunicator(const Library &_lib, const std::string &dumpfile)
    : lib(_lib) {
  initializeSslContext();
  fill_n(channelTypeToChannelNumber, ChannelType::MaxValue, -1);
  fill_n(channelHandlers, UINT8_MAX + 1, nullptr);
  channelHandlers[0] = new DefaultChannelHandler(0);
  channelHandlers[0]->sendToClient.connect(
      [this](int clientId, uint8_t channelNumber, bool specific,
             std::vector<uint8_t> data) {
        gotMessage(clientId, channelNumber, specific, data);
      });
  channelHandlers[0]->sendToHeadunit.connect(
      [this](uint8_t channelNumber, uint8_t flags, std::vector<uint8_t> data) {
        sendMessage(channelNumber, flags, data);
      });
  cout << "dumpfile: " << dumpfile << endl;

  if (!dumpfile.empty()) {
    pd = pcap_open_dead(DLT_NULL, 65535);
    pdumper = pcap_dump_open(pd, dumpfile.c_str());
  }
}

void AaCommunicator::setup(const Udc &udc) {
  mainGadget =
      unique_ptr<Gadget>(new Gadget(lib, 0x18d1, 0x2d00, rr("main_state")));
  mainGadget->setStrings("TAG", "AAServer", sr("TAGAAS"));

  auto tmpMountpoint = boost::filesystem::temp_directory_path() /
                       rr("AAServer_mp_loopback_main");
  create_directory(tmpMountpoint);
  ffs_function = unique_ptr<Function>(
      new FfsFunction(*mainGadget, rr("ffs_main"), tmpMountpoint.c_str()));

  auto configuration = new Configuration(*mainGadget, "c0");
  configuration->addFunction(*ffs_function, "ffs_main");

  ep0fd = open((tmpMountpoint / "ep0").c_str(), O_RDWR);
  if (ep0fd < 0)
    throw std::system_error(errno, std::generic_category(), "open FunctionFS ep0");
  write_descriptors_accessory(ep0fd);
  // Nonblocking mode avoids waiting for endpoint enable and mutex contention.
  // FunctionFS can still block for transfer completion: ep0's deadline check
  // invokes the normal error/teardown path, whose SIGUSR1 interrupts bulk I/O.
  ep1fd = open((tmpMountpoint / "ep1").c_str(), O_RDWR | O_NONBLOCK);
  ep2fd = open((tmpMountpoint / "ep2").c_str(), O_RDWR | O_NONBLOCK);
  if (ep0fd < 0 || ep1fd < 0 || ep2fd < 0)
    throw std::system_error(errno, std::generic_category(), "open FunctionFS endpoint");

  usbEndpoints.beginStartup();
  installUsbInterruptHandler();

  startThread(ep0fd, readWraper,
              [=](auto &&... args) { return handleEp0Message(args...); });
  startThread(
      ep1fd, [=](auto &&... args) { return getMessage(args...); }, write, false, true);
  startThread(ep2fd, readWraper,
              [=](auto &&... args) { return handleMessage(args...); }, true, false);

  mainGadget->enable(udc);
}

ssize_t AaCommunicator::readWraper(int fd, void *buf, size_t nbytes) {
  struct timeval timeout {
    0, 100000
  };

  fd_set set;
  FD_ZERO(&set);
  FD_SET(fd, &set);

  auto rv = select(fd + 1, &set, NULL, NULL, &timeout);
  if (rv == -1) {
    return -1l;
  } else if (rv == 0) {
    errno = EINTR;
    return 0l;
  } else
    return read(fd, buf, nbytes); /* there was data to read */
}

void AaCommunicator::startThread(
    int fd, std::function<ssize_t(int, void *, size_t)> readFun,
    std::function<ssize_t(int, const void *, size_t)> writeFun,
    bool bulkRead, bool bulkWrite) {
  auto td = new ThreadDescriptor();
  td->fd = fd;
  td->readFun = readFun;
  td->writeFun = writeFun;
  td->endFun = [this](const std::exception &ex) { threadTerminated(ex); };
  td->checkTerminate = [this]() { return threadFinished.load(); };
  td->bulkRead = bulkRead;
  td->bulkWrite = bulkWrite;
  threads.push_back(std::thread(&AaCommunicator::dataPump, this, td));
}

void AaCommunicator::dataPump(ThreadDescriptor *t) {
  std::unique_ptr<ThreadDescriptor> descriptor(t);
  int bufSize = 100 * 1024;
  char buffer[bufSize];

  for (;;) {
    try {
      if (t->checkTerminate())
        return;
      if (!t->bulkRead && !t->bulkWrite)
        usbEndpoints.checkStartupDeadline();
      auto generation = t->bulkRead ? usbEndpoints.waitEnabled() : 0;
      errno = 0;
      auto length = t->readFun(t->fd, buffer, bufSize);
      int readError = errno;
      if (t->checkTerminate())
        return;
      if (length <= 0) {
        if (readError == EINTR)
          continue; // select/getMessage timeout, or an interrupted syscall
        if (readError == EAGAIN || readError == EWOULDBLOCK) {
          if (t->bulkRead)
            usbEndpoints.pauseTransient();
          continue;
        }
        if (length < 0 && readError == ESHUTDOWN && t->bulkRead) {
          cout << "USB startup ESHUTDOWN: waiting for newer FUNCTIONFS_ENABLE" << endl;
          usbEndpoints.recoverStartup(generation);
          continue;
        }
        if (length == 0 && t->bulkRead) {
          // FunctionFS can complete a valid USB zero-length packet. It does
          // not start the AA session and must not be mistaken for socket EOF.
          usbEndpoints.pauseTransient();
          continue;
        }
        if (length == 0)
          throw std::runtime_error("transport read returned zero without progress");
        throw std::system_error(readError, std::generic_category(), "transport read");
      }
      if (t->bulkRead)
        usbEndpoints.bytesReceived();
      pumpPendingBytes(buffer, static_cast<size_t>(length),
          [=](const void *data, size_t remaining) { return t->writeFun(t->fd, data, remaining); },
          [=]() { return t->bulkWrite ? usbEndpoints.waitEnabled() : 0; },
          [=](UsbEndpointState::Generation failedGeneration) {
            if (!t->bulkWrite)
              throw std::runtime_error("ESHUTDOWN outside USB endpoint write");
            cout << "USB startup ESHUTDOWN: retaining pending bytes until newer FUNCTIONFS_ENABLE" << endl;
            usbEndpoints.recoverStartup(failedGeneration);
          },
          [=]() {
            if (t->bulkWrite)
              usbEndpoints.pauseTransient();
          }, t->checkTerminate);
    } catch (const std::exception &ex) {
      if (t->checkTerminate())
        return;
      t->endFun(ex);
      break;
    }
  }
  return;
}

void AaCommunicator::threadTerminated(const std::exception &ex) {
  {
    std::unique_lock<std::mutex> lk(m);
    threadFinished = true;
  }
  cv.notify_all();
  usbEndpoints.stop();
  sendQueueNotEmpty.notify_all();
  error(ex);
}

AaCommunicator::~AaCommunicator() {
  {
    std::unique_lock<std::mutex> lk(m);
    threadFinished = true;
  }

  usbEndpoints.stop();
  sendQueueNotEmpty.notify_all();

  // workaround for blocking read
  for (auto &&th : threads) {
    pthread_kill(th.native_handle(), SIGUSR1);
  }
  for (auto &&th : threads) {
    th.join();
  }

  if (ep2fd != -1)
    close(ep2fd);
  if (ep1fd != -1)
    close(ep1fd);
  if (ep0fd != -1)
    close(ep0fd);
  if (pdumper)
    pcap_dump_close(pdumper);
  if (pd)
    pcap_close(pd);
}
