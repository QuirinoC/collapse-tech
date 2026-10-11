# Include from the pinned AACS AAServer/CMakeLists after its AAServer target.
# Reuses the actual production sources and dependencies; only libusbgx's init /
# cleanup and the indicated TLS fault hooks are wrapped by the test executable.
get_target_property(TRANSPORT_TEST_SOURCES AAServer SOURCES)
list(FILTER TRANSPORT_TEST_SOURCES EXCLUDE REGEX "(^|/)main\\.cpp$")
get_target_property(TRANSPORT_TEST_LIBRARIES AAServer LINK_LIBRARIES)
get_filename_component(AIRPLAY_AA_BRIDGE_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
add_executable(aacs_tls_transport_test
    "${AIRPLAY_AA_BRIDGE_ROOT}/tests/aacs_tls_transport_test.cpp" ${TRANSPORT_TEST_SOURCES})
set_source_files_properties("${AIRPLAY_AA_BRIDGE_ROOT}/tests/aacs_tls_transport_test.cpp"
    PROPERTIES COMPILE_OPTIONS "-Wall;-Wextra;-Werror;-pedantic")
add_backward(aacs_tls_transport_test)
target_link_libraries(aacs_tls_transport_test ${TRANSPORT_TEST_LIBRARIES})
target_link_options(aacs_tls_transport_test PRIVATE
    -Wl,--wrap=usbg_init -Wl,--wrap=usbg_cleanup
    -Wl,--wrap=SSL_write -Wl,--wrap=SSL_read -Wl,--wrap=SSL_accept
    -Wl,--wrap=BIO_read)
