// Distributed under GPLv3 only as specified in AACS repository LICENSE.
// AirPlay-AA-Bridge fork: Snowmix optional; prefer socket-injected H.264.

#include "VideoChannelHandler.h"
#include "ChannelHandler.h"
#include "MediaChannelSetupResponse.pb.h"
#include "VideoFocusIndication.pb.h"
#include "enums.h"
#include "utils.h"
#include <boost/range/algorithm/max_element.hpp>
#include <algorithm>
#include <cstdlib>
#include <gst/gstelement.h>
#include <gst/gstmemory.h>
#include <gst/gstpad.h>
#include <gst/gstutils.h>
#include <chrono>
#include <iostream>
#include <linux/types.h>
#include <mutex>

using namespace std;

GstFlowReturn VideoChannelHandler::new_sample(GstElement *sink,
                                              VideoChannelHandler *_this) {
  GstSample *sample;
  g_signal_emit_by_name(sink, "pull-sample", &sample);
  if (!sample) {
    cout << "NOSAMPLE" << endl;
    return GST_FLOW_ERROR;
  }
  auto buffer = gst_sample_get_buffer(sample);

  vector<uint8_t> msgToHeadunit;
  if (buffer->pts == (GstClockTime)-1) {
    pushBackInt16(msgToHeadunit, MediaMessageType::MediaIndication);
  } else {
    pushBackInt16(msgToHeadunit,
                  MediaMessageType::MediaWithTimestampIndication);
    pushBackInt64(msgToHeadunit, buffer->pts / 1000);
  }
  GstMapInfo map;
  gst_buffer_map(buffer, &map, GST_MAP_READ);
  copy(map.data, map.data + map.size, back_inserter(msgToHeadunit));
  gst_buffer_unmap(buffer, &map);
  _this->handleMessageFromClient(-1, _this->channelId, false, msgToHeadunit);

  gst_sample_unref(sample);
  return GST_FLOW_OK;
}

static void error_cb(GstBus *bus, GstMessage *msg, VideoChannelHandler *_this) {
  (void)bus;
  (void)_this;
  cout << "ERROR" << endl;
  GError *err = nullptr;
  gchar *dbg = nullptr;
  gst_message_parse_error(msg, &err, &dbg);
  if (err) {
    cout << "GST error: " << err->message << endl;
    g_error_free(err);
  }
  if (dbg) {
    cout << "GST debug: " << dbg << endl;
    g_free(dbg);
  }
}

VideoChannelHandler::VideoChannelHandler(uint8_t channelId)
    : ChannelHandler(channelId) {
  cout << "VideoChannelHandler: " << (int)channelId << endl;
  channelOpened = false;
  gotSetupResponse = false;
  pipeline = nullptr;

  // Prefer client-injected H.264 (AirPlay bridge) over shm encode.
  // Set AIRPLAY_AA_SHM=/tmp/aacs_mixer to enable legacy BGRA shm ingest.
  const char *shm = getenv("AIRPLAY_AA_SHM");
  if (!shm || !*shm) {
    cout << "VideoChannelHandler: socket H.264 inject mode (no shm)" << endl;
    return;
  }

  cout << "VideoChannelHandler: shm mode path=" << shm << endl;
  pipeline = gst_pipeline_new("main-pipeline");

  auto app_sink = gst_element_factory_make("appsink", "app_sink");
  g_object_set(app_sink, "emit-signals", TRUE, NULL);
  g_signal_connect(app_sink, "new-sample", G_CALLBACK(new_sample), this);

  auto queue = gst_element_factory_make("queue", "queue");
  auto videoconvert = gst_element_factory_make("videoconvert", "videoconvert");
  auto videoscale = gst_element_factory_make("videoscale", "videoscale");
  auto videorate = gst_element_factory_make("videorate", "videorate");
  auto x264enc = gst_element_factory_make("x264enc", "x264enc");
  // tune=4 => zerolatency
  g_object_set(x264enc, "speed-preset", 1, "key-int-max", 25, "tune", 4, NULL);
  auto h264caps = gst_caps_new_simple(
      "video/x-h264", "stream-format", G_TYPE_STRING, "byte-stream", "profile",
      G_TYPE_STRING, "baseline", "width", G_TYPE_INT, 800, "height", G_TYPE_INT,
      480, "framerate", GST_TYPE_FRACTION, 30, 1, NULL);
  auto capsfilter_h264 =
      gst_element_factory_make("capsfilter", "capsfilter_h264");
  g_object_set(capsfilter_h264, "caps", h264caps, NULL);
  auto rawcaps =
      gst_caps_new_simple("video/x-raw", "width", G_TYPE_INT, 800, "height",
                          G_TYPE_INT, 480, "framerate", GST_TYPE_FRACTION, 30,
                          1, "format", G_TYPE_STRING, "I420", NULL);
  auto capsfilter_pre =
      gst_element_factory_make("capsfilter", "capsfilter_pre");
  g_object_set(capsfilter_pre, "caps", rawcaps, NULL);

  auto shmsrc = gst_element_factory_make("shmsrc", "shmsrc");
  g_object_set(G_OBJECT(shmsrc), "socket-path", shm, NULL);
  g_object_set(G_OBJECT(shmsrc), "is-live", TRUE, NULL);
  g_object_set(G_OBJECT(shmsrc), "do-timestamp", TRUE, NULL);
  auto queue_in = gst_element_factory_make("queue", "queue_in");
  g_object_set(G_OBJECT(queue_in), "leaky", 2, NULL);
  g_object_set(G_OBJECT(queue_in), "max-size-buffers", 2, NULL);
  auto in_caps =
      gst_caps_new_simple("video/x-raw", "width", G_TYPE_INT, 800, "height",
                          G_TYPE_INT, 480, "framerate", GST_TYPE_FRACTION, 30,
                          1, "format", G_TYPE_STRING, "BGRA", NULL);
  auto capsfilter_in = gst_element_factory_make("capsfilter", "capsfilter_in");
  g_object_set(capsfilter_in, "caps", in_caps, NULL);

  gst_bin_add_many(GST_BIN(pipeline), shmsrc, queue_in, capsfilter_in,
                   videoconvert, videoscale, videorate, capsfilter_pre, queue,
                   x264enc, capsfilter_h264, app_sink, NULL);

  GSTCHECK(gst_element_link_many(shmsrc, queue_in, capsfilter_in, videoconvert,
                                 videoscale, videorate, capsfilter_pre, queue,
                                 x264enc, capsfilter_h264, app_sink, NULL));
  gst_caps_unref(h264caps);
  gst_caps_unref(rawcaps);
  gst_caps_unref(in_caps);

  auto bus = gst_element_get_bus(pipeline);
  gst_bus_add_signal_watch(bus);
  g_signal_connect(G_OBJECT(bus), "message::error", (GCallback)error_cb, this);
  gst_object_unref(bus);

  gst_element_set_state(pipeline, GST_STATE_PLAYING);
}

VideoChannelHandler::~VideoChannelHandler() {
  if (pipeline) {
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);
    pipeline = nullptr;
  }
}

void VideoChannelHandler::openChannel() {
  // One opener. A second socket client must not send another ChannelOpen
  // or clear gotSetupResponse while the first wait is in progress.
  static std::mutex open_mu;
  std::lock_guard<std::mutex> gate(open_mu);
  {
    std::lock_guard<std::mutex> lk(m);
    if (channelOpened && setupResponseReceived) {
      return;
    }
    // True before the waits so VideoFocusIndication is handled (StartIndication)
    // instead of being forwarded to the injector. Media is still held until
    // SetupResponse; a timeout leaves gotSetupResponse false so the next AU retries.
    gotSetupResponse = false;
    setupResponseReceived = false;
    streamStarted = false;
    // Focus belongs to the AA session, not a timeout/retry of AV setup.
    // Preserve an existing HU decision; a new handler resets all focus state.
    channelOpened = true;
  }
  std::cout << "VideoChannelHandler: openChannel channel "
            << static_cast<int>(channelId)
            << " (waiting up to 5s for ChannelOpenResponse, then SetupResponse)"
            << std::endl;
  if (!openChannelWithTimeout(5000)) {
    std::cout << "VideoChannelHandler: ChannelOpenResponse timed out on channel "
              << static_cast<int>(channelId) << "; will retry" << std::endl;
    return;
  }
  sendSetupRequest();
  expectSetupResponse();
}

void VideoChannelHandler::disconnected(int clientId) { (void)clientId; }

void VideoChannelHandler::sendSetupRequest() {
  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MediaMessageType::SetupRequest);
  plainMsg.push_back(0x08);
  // Current AV setup schemas use field 1 for H.264 codec value 3. Older
  // implementations use a configuration index here; do not change the
  // verified current/DHU request without an explicit legacy fallback.
  plainMsg.push_back(0x03);
  sendToHeadunit(channelId, FrameType::Bulk | EncryptionType::Encrypted,
                 plainMsg);
}

void VideoChannelHandler::expectSetupResponse() {
  std::unique_lock<std::mutex> lk(m);
  constexpr int timeout_ms = 5000;
  const bool ok = cv.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                              [=] { return setupResponseReceived; });
  if (ok) {
    std::cout << "VideoChannelHandler: SetupResponse "
              << (gotSetupResponse ? "accepted" : "rejected") << " on channel "
              << static_cast<int>(channelId) << std::endl;
  } else {
    std::cout << "VideoChannelHandler: timed out after " << timeout_ms
              << "ms waiting for SetupResponse on channel "
              << static_cast<int>(channelId)
              << "; will retry (video held until setup)" << std::endl;
  }
}

void VideoChannelHandler::sendFocusRequest() {
  // VideoFocusRequest 0x8007: field 2 PROJECTED=1, field 3 USER_SELECTION=4.
  // The AACS enum names are inverted: service-specific means bit 0x04 CLEAR.
  const std::vector<uint8_t> request{0x80, 0x07, 0x10, 0x01, 0x18, 0x04};
  std::cout << "VideoChannelHandler: requesting PROJECTED focus on channel "
            << static_cast<int>(channelId) << std::endl;
  sendToHeadunit(channelId, FrameType::Bulk | EncryptionType::Encrypted, request);
}

void VideoChannelHandler::sendStartIndication() {
  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MediaMessageType::StartIndication);
  plainMsg.push_back(0x08);
  plainMsg.push_back(0x00);
  plainMsg.push_back(0x10);
  plainMsg.push_back(0x00);
  std::cout << "VideoChannelHandler: StartIndication on channel "
            << static_cast<int>(channelId) << std::endl;
  sendToHeadunit(channelId, FrameType::Bulk | EncryptionType::Encrypted,
                 plainMsg);
}

bool VideoChannelHandler::handleMessageFromHeadunit(const Message &message) {
  if (message.content.size() < 2)
    return false;
  const auto &msg = message.content;
  const auto messageType = (uint16_t(msg[0]) << 8) | msg[1];
  bool opened;
  {
    std::lock_guard<std::mutex> lock(m);
    opened = channelOpened;
  }
  if (!opened && messageType != MediaMessageType::VideoFocusIndication) {
    ChannelHandler::sendToClient(-1, message.channel,
                                 message.flags & MessageTypeFlags::Specific,
                                 message.content);
    return true;
  }
  if (ChannelHandler::handleMessageFromHeadunit(message))
    return true;
  if (messageType == MediaMessageType::MediaAckIndication)
    return true;
  if (messageType == MediaMessageType::SetupResponse) {
    tag::aas::MediaChannelSetupResponse response;
    const bool parsed = response.ParseFromArray(msg.data() + 2, msg.size() - 2);
    const bool configAccepted = std::find(response.configs().begin(),
        response.configs().end(), 0) != response.configs().end();
    const bool accepted = parsed && response.media_status() ==
        tag::aas::MediaChannelSetupResponse::OK && configAccepted;
    std::lock_guard<std::mutex> sendLock(sendMutex);
    bool requestFocus = false, start = false;
    {
      std::lock_guard<std::mutex> lock(m);
      if (setupResponseReceived) {
        std::cout << "VideoChannelHandler: duplicate SetupResponse ignored on channel "
                  << static_cast<int>(channelId) << std::endl;
        return true;
      }
      setupResponseReceived = true;
      gotSetupResponse = accepted;
      if (!accepted) {
        streamStarted = false;
      } else {
        // A HU indication received before setup already states its decision;
        // do not steal native focus or re-request an existing projected grant.
        requestFocus = !focusRequested && !focusIndicationReceived;
        focusRequested = true;
        start = (focusMode == 1 || focusMode == 4) && !streamStarted;
        if (start)
          streamStarted = true;
      }
    }
    std::cout << "VideoChannelHandler: setup status="
              << (response.has_media_status() ? int(response.media_status()) : -1)
              << " max_unacked="
              << (response.has_max_unacked() ? int(response.max_unacked()) : -1)
              << " config0=" << configAccepted << " accepted=" << accepted << std::endl;
    cv.notify_all();
    if (requestFocus)
      sendFocusRequest();
    if (start)
      sendStartIndication();
    return true;
  }
  if (messageType == MediaMessageType::VideoFocusIndication) {
    tag::aas::VideoFocusIndication indication;
    if (!indication.ParseFromArray(msg.data() + 2, msg.size() - 2) ||
        !indication.has_focus_mode()) {
      std::cout << "VideoChannelHandler: malformed VideoFocusIndication ignored" << std::endl;
      return true;
    }
    std::lock_guard<std::mutex> sendLock(sendMutex);
    bool start = false;
    {
      std::lock_guard<std::mutex> lock(m);
      focusMode = indication.focus_mode();
      focusIndicationReceived = true;
      if (focusMode == 1 || focusMode == 4) {
        start = gotSetupResponse && !streamStarted;
        if (start)
          streamStarted = true;
      } else {
        // Native focus is a HU/user decision. Pause without requesting it back.
        streamStarted = false;
      }
    }
    std::cout << "VideoChannelHandler: VideoFocusIndication mode="
              << indication.focus_mode() << " unrequested="
              << indication.unrequested() << std::endl;
    if (start)
      sendStartIndication();
    return true;
  }
  return false;
}

bool VideoChannelHandler::handleMessageFromClient(int clientId,
                                                  uint8_t channelId,
                                                  bool specific,
                                                  const vector<uint8_t> &data) {
  (void)clientId;
  if (data.empty()) {
    return false;
  }
  bool setupDone = false;
  {
    std::lock_guard<std::mutex> lk(m);
    setupDone = channelOpened && setupResponseReceived;
  }
  if (!setupDone) {
    openChannel();
    std::lock_guard<std::mutex> lk(m);
    setupDone = channelOpened && setupResponseReceived;
  }
  if (!setupDone) {
    return true;
  }
  std::lock_guard<std::mutex> sendLock(sendMutex);
  {
    std::lock_guard<std::mutex> lock(m);
    if (!gotSetupResponse || !streamStarted || (focusMode != 1 && focusMode != 4))
      return true; // No media before accepted setup and projected focus.
  }
  // Client supplies a complete AA media message (BE type + optional ts + AU).
  uint8_t flags = EncryptionType::Encrypted | FrameType::Bulk;
  if (specific) {
    flags |= MessageTypeFlags::Specific;
  }
  sendToHeadunit(channelId, flags, data);
  return true;
}
