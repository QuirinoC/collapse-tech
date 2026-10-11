// Exercises the real AaCommunicator TLS/queue path without gadget setup.
#include "AaCommunicator.h"
#include "Library.h"
#include <openssl/err.h>
#include <openssl/ssl.h>
#include <usbg/usbg.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <future>
#include <iostream>
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
template<class F> void expectFailure(F function) {
  bool failed = false;
  try { function(); } catch (const std::runtime_error &) { failed = true; }
  require(failed, "Expected encryption failure was accepted");
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
    AaCommunicator server(library, ""); Peer peer; peer.connect(server);
    serverSsl = Access::ssl(server); serverOutput = Access::output(server);
    writeFailuresAndFragmentation(server, peer);
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
    std::cout << "Actual AaCommunicator TLS failures, wire fragments, and serialization passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n'; return 1;
  }
}
