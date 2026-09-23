-- balatro_jev config
-- Point IPC_DIR at the Node bridge's ipc/ folder (absolute path recommended).
return {
  -- Absolute path to apps/balatro-jev/ipc on the machine running Balatro.
  -- TODO: auto-detect or expose a Steamodded config UI.
  IPC_DIR = nil, -- e.g. "/Users/you/dev/collapse-tech/apps/balatro-jev/ipc"

  -- Poll interval (Love frames / steps) for reading action.json
  ACTION_POLL_FRAMES = 15,

  -- Ignore action.json older than this many seconds (stale-response handling).
  ACTION_MAX_AGE_SEC = 8,

  -- When true, dump state every time the player could act; when false, only on request.
  AUTO_DUMP = true,
}
