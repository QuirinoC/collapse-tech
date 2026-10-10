// Distributed under GPLv3 only as specified in AACS repository LICENSE.
// AirPlay-AA-Bridge fork: Snowmix optional; prefer socket-injected H.264.

#include "VideoChannelHandler.h"
#include "ChannelHandler.h"
#include "enums.h"
#include "utils.h"
#include <boost/range/algorithm/max_element.hpp>
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
  static bool firstSample = true;
  GstSample *sample;
  g_signal_emit_by_name(sink, "pull-sample", &sample);
  if (!sample) {
    cout << "NOSAMPLE" << endl;
    return GST_FLOW_ERROR;
  }
  auto buffer = gst_sample_get_buffer(sample);

  vector<uint8_t> msgToHeadunit;
  if (firstSample) {
    _this->openChannel();
  }
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
  _this->sendToHeadunit(_this->channelId,
                        EncryptionType::Encrypted | FrameType::Bulk,
                        msgToHeadunit);

  gst_sample_unref(sample);
  firstSample = false;
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
    if (channelOpened && gotSetupResponse) {
      return;
    }
    // True before the waits so VideoFocusIndication is handled (StartIndication)
    // instead of being forwarded to the injector. Media is still held until
    // SetupResponse; a timeout leaves gotSetupResponse false so the next AU retries.
    gotSetupResponse = false;
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
  plainMsg.push_back(0x03);
  sendToHeadunit(channelId, FrameType::Bulk | EncryptionType::Encrypted,
                 plainMsg);
}

void VideoChannelHandler::expectSetupResponse() {
  std::unique_lock<std::mutex> lk(m);
  constexpr int timeout_ms = 5000;
  const bool ok = cv.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                              [=] { return gotSetupResponse; });
  if (ok) {
    std::cout << "VideoChannelHandler: SetupResponse on channel "
              << static_cast<int>(channelId) << std::endl;
  } else {
    std::cout << "VideoChannelHandler: timed out after " << timeout_ms
              << "ms waiting for SetupResponse on channel "
              << static_cast<int>(channelId)
              << "; will retry (video held until setup)" << std::endl;
  }
}

void VideoChannelHandler::sendStartIndication() {
  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MediaMessageType::StartIndication);
  plainMsg.push_back(0x08);
  plainMsg.push_back(0x00);
  plainMsg.push_back(0x10);
  plainMsg.push_back(0x00);
  sendToHeadunit(channelId, FrameType::Bulk | EncryptionType::Encrypted,
                 plainMsg);
}

bool VideoChannelHandler::handleMessageFromHeadunit(const Message &message) {
  if (!channelOpened) {
    ChannelHandler::sendToClient(-1, message.channel,
                                 message.flags & MessageTypeFlags::Specific,
                                 message.content);
    return true;
  }
  if (ChannelHandler::handleMessageFromHeadunit(message))
    return true;
  bool messageHandled = false;
  {
    std::unique_lock<std::mutex> lk(m);
    auto msg = message.content;
    const __u16 *shortView = (const __u16 *)(msg.data());
    auto messageType = be16_to_cpu(shortView[0]);
    if (messageType == MediaMessageType::SetupResponse) {
      gotSetupResponse = true;
      messageHandled = true;
    } else if (messageType == MediaMessageType::VideoFocusIndication) {
      sendStartIndication();
      messageHandled = true;
    } else if (messageType == MediaMessageType::MediaAckIndication) {
      messageHandled = true;
    }
  }
  cv.notify_all();
  return messageHandled;
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
    setupDone = channelOpened && gotSetupResponse;
  }
  if (!setupDone) {
    openChannel();
    std::lock_guard<std::mutex> lk(m);
    setupDone = channelOpened && gotSetupResponse;
  }
  if (!setupDone) {
    return true;
  }
  // Client supplies a complete AA media message (BE type + optional ts + AU).
  uint8_t flags = EncryptionType::Encrypted | FrameType::Bulk;
  if (specific) {
    flags |= MessageTypeFlags::Specific;
  }
  sendToHeadunit(channelId, flags, data);
  return true;
}
