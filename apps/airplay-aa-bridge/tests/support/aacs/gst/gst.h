// The actual production handler is compiled, but its optional legacy SHM path
// is disabled. These link stubs deliberately abort if that path is exercised.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdlib>
using GstFlowReturn = int;
using GstClockTime = uint64_t;
using gchar = char;
using GCallback = void (*)();
struct GstElement {};
struct GstBus {};
struct GstMessage {};
struct GstCaps {};
struct GstSample {};
struct GstBuffer { GstClockTime pts; };
struct GstMapInfo { uint8_t *data; size_t size; };
struct GError { const char *message; };
constexpr int GST_FLOW_ERROR = -1, GST_FLOW_OK = 0, GST_MAP_READ = 1;
constexpr int GST_STATE_PLAYING = 1, GST_STATE_NULL = 0;
constexpr int G_TYPE_STRING = 1, G_TYPE_INT = 2, GST_TYPE_FRACTION = 3;
constexpr int TRUE = 1;
#define G_OBJECT(x) (x)
#define GST_BIN(x) (x)
#define G_CALLBACK(x) reinterpret_cast<GCallback>(x)
template <typename... T> void g_signal_emit_by_name(T...) { std::abort(); }
inline GstBuffer *gst_sample_get_buffer(GstSample *) { std::abort(); }
template <typename... T> void gst_buffer_map(T...) { std::abort(); }
template <typename... T> void gst_buffer_unmap(T...) { std::abort(); }
inline void gst_sample_unref(GstSample *) { std::abort(); }
template <typename... T> void gst_message_parse_error(T...) { std::abort(); }
inline void g_error_free(GError *) { std::abort(); }
inline void g_free(gchar *) { std::abort(); }
inline GstElement *gst_pipeline_new(const char *) { std::abort(); }
template <typename... T> GstElement *gst_element_factory_make(T...) { std::abort(); }
template <typename... T> void g_object_set(T...) { std::abort(); }
template <typename... T> void g_signal_connect(T...) { std::abort(); }
template <typename... T> GstCaps *gst_caps_new_simple(T...) { std::abort(); }
template <typename... T> void gst_bin_add_many(T...) { std::abort(); }
template <typename... T> bool gst_element_link_many(T...) { std::abort(); }
inline void gst_caps_unref(GstCaps *) { std::abort(); }
inline GstBus *gst_element_get_bus(GstElement *) { std::abort(); }
inline void gst_bus_add_signal_watch(GstBus *) { std::abort(); }
template <typename T> void gst_object_unref(T *) { std::abort(); }
inline void gst_element_set_state(GstElement *, int) { std::abort(); }
