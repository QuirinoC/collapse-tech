// Exercises the real AaCommunicator TLS/queue path without gadget setup.
#include "AaCommunicator.h"
#include "Library.h"
#include "DefaultChannelHandler.h"
#include "ServiceDiscoveryRequest.pb.h"
#include "ServiceDiscoveryResponse.pb.h"
#include <openssl/err.h>
#include <openssl/ssl.h>
#include <usbg/usbg.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <future>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std::chrono_literals;
namespace {
void require(bool condition, const char *message) {
  if (!condition) throw std::runtime_error(message);
}
std::atomic<int> writeFault{0}, drainFault{0}, reads{0}, accepts{0}, writes{0};
SSL *serverSsl = nullptr;
BIO *serverOutput = nullptr;
std::mutex gateMutex;
std::condition_variable gateChanged;
bool gated = false, gateDrain = false, entered = false, released = false;
void waitAtGate(bool drain) {
  std::unique_lock<std::mutex> lock(gateMutex);
  if (gated && gateDrain == drain) {
    entered = true; gateChanged.notify_all();
    gateChanged.wait(lock, [] { return released; });
  }
}
}
// Library construction normally enumerates configfs. These two wrappers avoid
// any hardware/filesystem gadget access; AaCommunicator::setup is never called.
extern "C" int __wrap_usbg_init(const char *, usbg_state **state) {
  *state = nullptr; return 0;
}
extern "C" void __wrap_usbg_cleanup(usbg_state *) {}
extern "C" int __real_SSL_write(SSL *, const void *, int);
extern "C" int __real_SSL_read(SSL *, void *, int);
extern "C" int __real_SSL_accept(SSL *);
extern "C" int __real_BIO_read(BIO *, void *, int);
extern "C" int __wrap_SSL_write(SSL *ssl, const void *data, int size) {
  if (ssl == serverSsl) {
    ++writes;
    const auto fault = writeFault.exchange(0);
    if (fault == 1) return 0;
    if (fault == 2) return -1;
    if (fault == 3) return size - 1;
    waitAtGate(false);
  }
  return __real_SSL_write(ssl, data, size);
}
extern "C" int __wrap_SSL_read(SSL *ssl, void *data, int size) {
  if (ssl == serverSsl) ++reads;
  return __real_SSL_read(ssl, data, size);
}
extern "C" int __wrap_SSL_accept(SSL *ssl) {
  if (ssl == serverSsl) ++accepts;
  return __real_SSL_accept(ssl);
}
extern "C" int __wrap_BIO_read(BIO *bio, void *data, int size) {
  if (bio == serverOutput) {
    const auto fault = drainFault.exchange(0);
    if (fault == 1) return 0;
    if (fault == 2) return -1;
    if (fault == 3) return __real_BIO_read(bio, data, size - 1);
    waitAtGate(true);
  }
  return __real_BIO_read(bio, data, size);
}
class AaCommunicatorTlsTestAccess {
public:
  static SSL *ssl(AaCommunicator &a) { return a.ssl; }
  static BIO *output(AaCommunicator &a) { return a.writeBio; }
  static void handshake(AaCommunicator &a, const std::vector<uint8_t> &data) {
    a.handleSslHandshake(data.data(), data.size());
  }
  static std::vector<uint8_t> decrypt(AaCommunicator &a, const std::vector<uint8_t> &data) {
    return a.decryptMessage(data);
  }
  static void receive(AaCommunicator &a, const uint8_t *data, size_t size) {
    require(a.handleMessage(-1, data, size) == static_cast<ssize_t>(size),
            "Receive path did not consume its byte chunk");
  }
  static void forwardChannel(AaCommunicator &a, uint8_t channel) {
    require(a.channelHandlers[channel] == nullptr, "Fixture channel already exists");
    a.channelHandlers[channel] = new DefaultChannelHandler(channel);
    a.channelHandlers[channel]->sendToClient.connect(
        [&a](int client, uint8_t id, bool specific, std::vector<uint8_t> data) {
          a.gotMessage(client, id, specific, data);
        });
  }
  static void enqueue(AaCommunicator &a, const std::vector<uint8_t> &data) {
    a.sendMessage(2, 0x0b, data);
  }
  static std::vector<uint8_t> next(AaCommunicator &a, size_t capacity = 65536) {
    std::vector<uint8_t> data(capacity);
    const auto n = a.getMessage(-1, data.data(), data.size());
    require(n > 0, "No queued frame"); data.resize(n); return data;
  }
  static std::vector<Message> queue(AaCommunicator &a) {
    std::lock_guard<std::mutex> lock(a.sendQueueMutex);
    return {a.sendQueue.begin(), a.sendQueue.end()};
  }
  static std::vector<ChannelHandler *> handlers(AaCommunicator &a) {
    return {std::begin(a.channelHandlers), std::end(a.channelHandlers)};
  }
  static std::vector<uint8_t> channelTypes(AaCommunicator &a) {
    return {std::begin(a.channelTypeToChannelNumber),
            std::end(a.channelTypeToChannelNumber)};
  }
  static void releaseTls(AaCommunicator &a) {
    SSL_free(a.ssl); SSL_CTX_free(a.ctx);
    a.ssl = nullptr; a.ctx = nullptr; a.readBio = a.writeBio = nullptr;
  }
};
namespace {
using Access = AaCommunicatorTlsTestAccess;
std::vector<uint8_t> drain(BIO *bio) {
  std::vector<uint8_t> bytes(BIO_ctrl_pending(bio));
  if (!bytes.empty()) require(BIO_read(bio, bytes.data(), bytes.size()) ==
                             static_cast<int>(bytes.size()), "BIO drain failed");
  return bytes;
}
struct Peer {
  SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
  SSL *ssl = SSL_new(ctx);
  BIO *input = BIO_new(BIO_s_mem()), *output = BIO_new(BIO_s_mem());
  Peer() {
    SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, nullptr);
    SSL_set_max_proto_version(ssl, TLS1_2_VERSION);
    SSL_set_bio(ssl, input, output); SSL_set_connect_state(ssl);
  }
  ~Peer() { SSL_free(ssl); SSL_CTX_free(ctx); }
  void connect(AaCommunicator &server) {
    for (int i = 0; i != 20; ++i) {
      const auto status = SSL_do_handshake(ssl);
      if (status <= 0) require(SSL_get_error(ssl, status) == SSL_ERROR_WANT_READ,
                               "Client handshake failed");
      auto outgoing = drain(output);
      if (!outgoing.empty()) {
        Access::handshake(server, outgoing);
        auto reply = Access::next(server);
        require(reply[0] == 0 && reply[1] == 3 && reply[4] == 0 && reply[5] == 3,
                "Unexpected handshake AA frame");
        if (reply.size() > 6)
          require(BIO_write(input, reply.data() + 6, reply.size() - 6) ==
                  static_cast<int>(reply.size() - 6), "Client BIO feed failed");
      }
      if (SSL_is_init_finished(ssl) && SSL_is_init_finished(Access::ssl(server))) return;
    }
    throw std::runtime_error("Handshake did not complete");
  }
  std::vector<uint8_t> decode(const std::vector<uint8_t> &frame) {
    const size_t header = (frame[1] & 3) == 1 ? 8 : 4;
    const auto wireLength = (frame[2] << 8) | frame[3];
    require(frame.size() == header + wireLength, "Incorrect AA TLS frame length");
    require(BIO_write(input, frame.data() + header, wireLength) == wireLength,
            "Client feed failed");
    std::vector<uint8_t> plain(10000);
    const auto n = SSL_read(ssl, plain.data(), plain.size());
    require(n > 0, "Client could not decrypt AA frame"); plain.resize(n); return plain;
  }
  std::vector<uint8_t> encode(const std::vector<uint8_t> &plain) {
    require(SSL_write(ssl, plain.data(), plain.size()) == static_cast<int>(plain.size()),
            "Client encryption failed"); return drain(output);
  }
};
void sameQueue(const std::vector<Message> &before, AaCommunicator &server) {
  auto after = Access::queue(server);
  require(after.size() == before.size(), "Failed encryption consumed queue entry");
  for (size_t i = 0; i < before.size(); ++i)
    require(after[i].offset == before[i].offset && after[i].flags == before[i].flags &&
            after[i].content == before[i].content, "Failed encryption advanced fragment");
}
std::vector<uint8_t> receiveFrame(uint8_t flags, const std::vector<uint8_t> &body,
                                 uint32_t total = 0, uint8_t channel = 0) {
  require(body.size() <= UINT16_MAX, "Fixture frame too large");
  std::vector<uint8_t> wire{channel, flags, static_cast<uint8_t>(body.size() >> 8),
                           static_cast<uint8_t>(body.size())};
  if ((flags & 3) == 1)
    for (int shift : {24, 16, 8, 0}) wire.push_back(total >> shift);
  wire.insert(wire.end(), body.begin(), body.end());
  return wire;
}
void incomingReadBoundariesAndFragments(AaCommunicator &server, Peer &peer) {
  std::vector<std::vector<uint8_t>> received;
  std::vector<uint8_t> channels;
  const auto connection = server.gotMessage.connect(
      [&](int, uint8_t channel, bool, std::vector<uint8_t> bytes) {
        channels.push_back(channel); received.push_back(bytes);
      });
  // A real handler routes AudioFocusResponse to clients without interpreting
  // its protobuf body. This lets us assert byte-exact final dispatch after TLS.
  std::vector<uint8_t> payload(5000);
  for (size_t i = 0; i < payload.size(); ++i) payload[i] = (i * 31) & 255;
  payload[0] = static_cast<unsigned>(MessageType::AudioFocusResponse) >> 8;
  payload[1] = static_cast<unsigned>(MessageType::AudioFocusResponse) & 255;
  std::vector<uint8_t> wire;
  for (size_t offset = 0; offset < payload.size(); offset += 2000) {
    const auto end = std::min(payload.size(), offset + 2000);
    const std::vector<uint8_t> part(payload.begin() + offset, payload.begin() + end);
    const uint8_t flags = offset == 0 ? 9 : end == payload.size() ? 10 : 8;
    const auto frame = receiveFrame(flags, peer.encode(part), payload.size());
    wire.insert(wire.end(), frame.begin(), frame.end());
  }
  // One byte per USB read exercises every header/body boundary, including the
  // First frame's 32-bit size extension and the TLS record headers themselves.
  for (size_t i = 0; i < wire.size(); ++i) {
    Access::receive(server, wire.data() + i, 1);
    if (i + 1 < wire.size()) require(received.empty(), "Fragment dispatched early");
  }
  require(received == std::vector<std::vector<uint8_t>>({payload}),
          "Fragmented AA receive message was corrupted");
  // A >16KiB message creates several TLS records inside a single AA frame.
  // The next coalesced AA frame must not be assigned any leftover plaintext.
  auto large = payload; large.resize(42000, 0x5a);
  const auto first = receiveFrame(11, peer.encode(large));
  const auto second = receiveFrame(15, peer.encode(payload));
  wire = first; wire.insert(wire.end(), second.begin(), second.end());
  Access::receive(server, wire.data(), wire.size());
  require(received == std::vector<std::vector<uint8_t>>({payload, large, payload}),
          "Coalesced AA frames or multiple TLS records were corrupted");
  Access::forwardChannel(server, 7);
  received.clear(); channels.clear(); wire.clear();
  const std::vector<uint8_t> beginning(payload.begin(), payload.begin() + 2000);
  const std::vector<uint8_t> ending(payload.begin() + 2000, payload.end());
  // An independent service's fragmented message surrounds a complete control
  // message. Encryption follows wire order; delivery follows completion order.
  for (const auto &frame : {
      receiveFrame(9, peer.encode(beginning), payload.size(), 7),
      receiveFrame(11, peer.encode(payload)),
      receiveFrame(10, peer.encode(ending), 0, 7)}) {
    wire.insert(wire.end(), frame.begin(), frame.end());
  }
  Access::receive(server, wire.data(), wire.size());
  require(received == std::vector<std::vector<uint8_t>>({payload, payload}) &&
          channels == std::vector<uint8_t>({0, 7}),
          "Interleaved control and service fragments were corrupted");
  connection.disconnect();
}
template<class F> void expectFailure(F function) {
  bool failed = false;
  try { function(); } catch (const std::runtime_error &) { failed = true; }
  require(failed, "Expected encryption failure was accepted");
}

void receiveControl(AaCommunicator &server, Peer &peer, uint16_t type,
                    const std::vector<uint8_t> &body, bool encrypted = true) {
  std::vector<uint8_t> content{static_cast<uint8_t>(type >> 8),
                              static_cast<uint8_t>(type)};
  content.insert(content.end(), body.begin(), body.end());
  const auto wire = receiveFrame(encrypted ? 11 : 3,
                                 encrypted ? peer.encode(content) : content);
  Access::receive(server, wire.data(), wire.size());
}

class CoutCapture {
  std::ostringstream stream;
  std::streambuf *original = std::cout.rdbuf(stream.rdbuf());
public:
  ~CoutCapture() { std::cout.rdbuf(original); }
  std::string text() const { return stream.str(); }
};

void authenticationStatus(Library &library) {
  const std::vector<std::vector<uint8_t>> rejected{
      {},                         // Required status absent.
      {0x08},                     // Truncated status varint.
      {0x0a, 0x00},               // Status has wrong wire type.
      {0x08, 0x01},               // Explicit rejection.
      {0x08, 0x7f},               // Unknown nonzero status.
      {0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01},
  };
  for (const auto &body : rejected) {
    AaCommunicator server(library, ""); Peer peer; peer.connect(server);
    Access::enqueue(server, {0x00, 0x0d, 0x08, 0x43});
    const auto queue = Access::queue(server);
    const auto handlers = Access::handlers(server);
    const auto descriptor = server.getServiceDescriptor();
    {
      CoutCapture captured;
      expectFailure([&] { receiveControl(server, peer, 4, body); });
      require(captured.text().find("auth complete") == std::string::npos,
              "Rejected authentication was logged as complete");
    }
    sameQueue(queue, server);
    require(Access::handlers(server) == handlers &&
            server.getServiceDescriptor() == descriptor,
            "Rejected authentication mutated discovery state");
    Access::releaseTls(server);
  }
  // Preserve both normal unencrypted AuthComplete and encrypted dispatch,
  // including unknown unrelated protobuf fields for forward compatibility.
  for (bool encrypted : {false, true}) {
    AaCommunicator server(library, ""); Peer peer; peer.connect(server);
    receiveControl(server, peer, 4, {0x08, 0x00, 0x10, 0x2a}, encrypted);
    const auto queued = Access::queue(server);
    require(queued.size() == 1 && queued[0].channel == 0 &&
            queued[0].flags == 0x0b && queued[0].content.size() > 2 &&
            queued[0].content[0] == 0 && queued[0].content[1] == 5,
            "Accepted authentication did not enqueue exactly one encrypted discovery request");
    const auto plain = peer.decode(Access::next(server));
    tag::aas::ServiceDiscoveryRequest discovery;
    require(discovery.ParseFromArray(plain.data() + 2, plain.size() - 2),
            "Post-authentication discovery request did not decode over TLS");
    require(Access::queue(server).empty(), "Authentication enqueued extra messages");
    Access::releaseTls(server);
  }
}

std::vector<uint8_t> discoveryBytes(const tag::aas::ServiceDiscoveryResponse &response) {
  const auto bytes = response.SerializeAsString();
  return {bytes.begin(), bytes.end()};
}

void addVideo(tag::aas::ServiceDiscoveryResponse &response, uint32_t channel) {
  auto *entry = response.add_channels();
  entry->set_channel_id(channel);
  auto *config = entry->mutable_media_channel()->add_video_configs();
  config->set_video_resolution(tag::aas::VideoResolution::H480);
  config->set_video_fps(tag::aas::VideoFps::F30);
  config->set_margin_width(0);
  config->set_margin_height(0);
  config->set_dpi(160);
  config->set_codec(3);
}

void discoveryChannelValidation(Library &library) {
  for (uint32_t invalid : {0u, 256u, UINT32_MAX, 20u}) {
    AaCommunicator server(library, ""); Peer peer; peer.connect(server);
    // Keep real prior state so rejection must preserve the published cache and
    // existing handler, in addition to not installing the first valid entry.
    tag::aas::ServiceDiscoveryResponse prior;
    prior.add_channels()->set_channel_id(33);
    receiveControl(server, peer, 6, discoveryBytes(prior));
    const auto handlers = Access::handlers(server);
    const auto types = Access::channelTypes(server);
    const auto descriptor = server.getServiceDescriptor();
    const auto queue = Access::queue(server);
    tag::aas::ServiceDiscoveryResponse response;
    addVideo(response, 20);
    response.add_channels()->set_channel_id(invalid);
    expectFailure([&] { receiveControl(server, peer, 6, discoveryBytes(response)); });
    require(Access::handlers(server) == handlers &&
            Access::channelTypes(server) == types &&
            server.getServiceDescriptor() == descriptor,
            "Invalid discovery partially changed handlers, channel types, or cached descriptor");
    sameQueue(queue, server);
    Access::releaseTls(server);
  }
  AaCommunicator server(library, ""); Peer peer; peer.connect(server);
  tag::aas::ServiceDiscoveryResponse response;
  for (uint32_t id : {1u, 254u, 255u}) response.add_channels()->set_channel_id(id);
  addVideo(response, 20);
  auto *input = response.add_channels();
  input->set_channel_id(21);
  input->mutable_input_channel()->add_available_buttons(19);
  auto body = discoveryBytes(response);
  body.insert(body.end(), {0x10, 0x2a}); // Unrelated future descriptor field.
  receiveControl(server, peer, 6, body);
  const auto handlers = Access::handlers(server);
  for (uint32_t id : {0u, 1u, 20u, 21u, 254u, 255u})
    require(handlers[id] != nullptr, "Valid discovery boundary or service channel was rejected");
  require(server.getChannelNumberByChannelType(ChannelType::Video) == 20 &&
          server.getChannelNumberByChannelType(ChannelType::Input) == 21 &&
          server.getServiceDescriptor() == body,
          "Valid discovery did not publish advertised services and exact descriptor");
  Access::releaseTls(server);
}

void writeFailuresAndFragmentation(AaCommunicator &server, Peer &peer) {
  std::vector<uint8_t> payload(5000);
  for (size_t i = 0; i < payload.size(); ++i) payload[i] = (i * 31) & 255;
  Access::enqueue(server, payload);
  for (int fault : {1, 2, 3}) {
    const auto before = Access::queue(server); writeFault = fault;
    expectFailure([&] { Access::next(server); }); sameQueue(before, server);
  }
  auto first = Access::next(server);
  require(first[0] == 2 && first[1] == 9 && first[4] == 0 && first[5] == 0 &&
          first[6] == 0x13 && first[7] == 0x88, "First-fragment wire header changed");
  auto decoded = peer.decode(first);
  auto before = Access::queue(server); writeFault = 1;
  expectFailure([&] { Access::next(server); }); sameQueue(before, server);
  auto middle = Access::next(server);
  require(middle[1] == 8, "Middle-fragment wire header changed");
  auto part = peer.decode(middle); decoded.insert(decoded.end(), part.begin(), part.end());
  auto last = Access::next(server);
  require(last[1] == 10, "Last-fragment wire header changed");
  part = peer.decode(last); decoded.insert(decoded.end(), part.begin(), part.end());
  require(decoded == payload && Access::queue(server).empty(), "TLS payload was lost/duplicated");
}
void serialization(AaCommunicator &server, Peer &peer, bool handshake, bool drain) {
  const std::vector<uint8_t> incoming{0x00, 0x0c, 0x08, 0x42};
  auto encrypted = handshake ? std::vector<uint8_t>{} : peer.encode(incoming);
  Access::enqueue(server, {0x00, 0x0d, 0x08, 0x43});
  reads = 0; accepts = 0;
  { std::lock_guard<std::mutex> lock(gateMutex);
    gated = true; gateDrain = drain; entered = released = false; }
  auto sending = std::async(std::launch::async, [&] { return Access::next(server); });
  bool enteredInTime;
  { std::unique_lock<std::mutex> lock(gateMutex);
    enteredInTime = gateChanged.wait_for(lock, 2s, [] { return entered; }); }
  std::promise<void> receiveStarted;
  auto receiveStart = receiveStarted.get_future();
  auto receiving = std::async(std::launch::async, [&] {
    receiveStarted.set_value();
    if (handshake) { Access::handshake(server, {}); return std::vector<uint8_t>{}; }
    return Access::decrypt(server, encrypted);
  });
  const bool receiverStarted = receiveStart.wait_for(2s) == std::future_status::ready;
  auto enqueueing = std::async(std::launch::async, [&] { Access::enqueue(server, {1, 2, 3}); });
  const bool enqueueReady = enqueueing.wait_for(500ms) == std::future_status::ready;
  const bool receiveBlocked = receiving.wait_for(150ms) == std::future_status::timeout;
  const bool noTlsOverlap = reads == 0 && accepts == 0;
  { std::lock_guard<std::mutex> lock(gateMutex); released = true; gated = false; }
  gateChanged.notify_all();
  auto sent = sending.get(); auto received = receiving.get(); enqueueing.get();
  require(enteredInTime && enqueueReady, "TLS lock blocks producer queue or gate timed out");
  require(receiverStarted && receiveBlocked && noTlsOverlap,
          "Receive/handshake mutated SSL during outbound write");
  require(peer.decode(sent) == std::vector<uint8_t>({0, 13, 8, 67}), "Concurrent send corruption");
  if (!handshake) require(received == incoming, "Concurrent receive corruption");
  require(peer.decode(Access::next(server)) == std::vector<uint8_t>({1, 2, 3}),
          "Producer queue append lost");
  if (handshake) Access::next(server); // Empty handshake response, enqueued after releasing TLS.
}
void drainFailure(AaCommunicator &server, int fault, size_t capacity = 65536) {
  Access::enqueue(server, {1, 2, 3, 4});
  auto before = Access::queue(server);
  drainFault = fault;
  expectFailure([&] { Access::next(server, capacity); }); sameQueue(before, server);
  // A failed drain leaves TLS output unusable for the next AA frame. The real
  // session aborts; it must never relabel those residual bytes as new video.
  expectFailure([&] { Access::next(server); }); sameQueue(before, server);
}
void pendingOutput(AaCommunicator &server) {
  Access::enqueue(server, {1, 2, 3, 4});
  auto before = Access::queue(server);
  const char stale[] = "unassigned TLS output";
  require(BIO_write(serverOutput, stale, sizeof stale) == static_cast<int>(sizeof stale),
          "Fixture BIO write failed");
  const auto calls = writes.load();
  expectFailure([&] { Access::next(server); }); sameQueue(before, server);
  require(writes == calls, "Pending ciphertext was mixed with another AA message");
}
}
int main() {
  try {
    Library library("unused-configfs-path");
    authenticationStatus(library);
    discoveryChannelValidation(library);
    AaCommunicator server(library, ""); Peer peer; peer.connect(server);
    serverSsl = Access::ssl(server); serverOutput = Access::output(server);
    writeFailuresAndFragmentation(server, peer);
    incomingReadBoundariesAndFragments(server, peer);
    Access::releaseTls(server);
    serverSsl = nullptr; serverOutput = nullptr;
    // Keep the synthetic no-input handshake checks in independent sessions;
    // RX scenarios alone generate and deliver application TLS records.
    for (bool handshake : {false, true}) {
      for (bool drain : {false, true}) {
        AaCommunicator concurrent(library, ""); Peer other; other.connect(concurrent);
        serverSsl = Access::ssl(concurrent); serverOutput = Access::output(concurrent);
        serialization(concurrent, other, handshake, drain);
        Access::releaseTls(concurrent);
        serverSsl = nullptr; serverOutput = nullptr;
      }
    }
    for (int fault : {1, 2, 3, 4, 5}) {
      AaCommunicator failing(library, ""); Peer other; other.connect(failing);
      serverSsl = Access::ssl(failing); serverOutput = Access::output(failing);
      if (fault == 5) pendingOutput(failing);
      else drainFailure(failing, fault == 4 ? 0 : fault, fault == 4 ? 8 : 65536);
      Access::releaseTls(failing);
      serverSsl = nullptr; serverOutput = nullptr;
    }
    std::cout << "Actual AaCommunicator authentication/discovery validation, TLS failures, receive boundaries/fragments, and serialization passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n'; return 1;
  }
}
