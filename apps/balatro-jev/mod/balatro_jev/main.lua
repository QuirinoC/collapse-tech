--- Balatro Jev — Steamodded entry
--- Assumptions:
---   * Steamodded (SMODS) is installed and loads this folder as a mod.
---   * Desktop Balatro (Love2D) allows io.open to an absolute IPC_DIR.
---   * A Node bridge (`npm run watch`) is running and watching ipc/state.json.
---
--- This scaffold dumps state and applies actions via stubs. Replace TODOs in
--- state.lua / actions.lua with confirmed Balatro APIs before relying on it
--- for real runs.

local config = assert(SMODS.load_mod_config and SMODS.load_mod_config() or nil)
  or require("config")
-- If Steamodded config loader differs, fall back to local config.lua table.
if type(config) ~= "table" or config.IPC_DIR == nil and not config.ACTION_POLL_FRAMES then
  -- bundled default
  package.loaded["balatro_jev_config"] = nil
  config = {
    IPC_DIR = nil,
    ACTION_POLL_FRAMES = 15,
    ACTION_MAX_AGE_SEC = 8,
    AUTO_DUMP = true,
  }
end

local state_mod = assert(SMODS and SMODS.load_file and SMODS.load_file("state.lua")())
  or error("balatro_jev: failed to load state.lua")
-- Prefer relative requires when SMODS.load_file is unavailable in tests:
local ok_state, state_req = pcall(function() return require("state") end)
if ok_state and type(state_req) == "table" then state_mod = state_req end

local actions_mod = nil
local ok_act, act_req = pcall(function()
  if SMODS and SMODS.load_file then return SMODS.load_file("actions.lua")() end
  return require("actions")
end)
if ok_act then actions_mod = act_req end

local ipc_mod = nil
local ok_ipc, ipc_req = pcall(function()
  if SMODS and SMODS.load_file then return SMODS.load_file("ipc.lua")() end
  return require("ipc")
end)
if ok_ipc then ipc_mod = ipc_req end

local frame = 0
local last_state_hash = nil
local pending_request_id = nil

local function hash_simple(s)
  -- crude change detector
  return tostring(#s) .. ":" .. tostring(s:sub(1, 32)) .. ":" .. tostring(s:sub(-32))
end

local function dump_if_ready()
  if not config.IPC_DIR or config.IPC_DIR == "" then
    return
  end
  if not ipc_mod or not state_mod then return end
  local st = state_mod.dump()
  local encoded = ipc_mod.encode_json(st)
  local h = hash_simple(encoded)
  if h == last_state_hash then return end
  last_state_hash = h
  local ok, err = ipc_mod.write_state(config.IPC_DIR, st)
  if not ok then
    print("[balatro_jev] write_state failed: " .. tostring(err))
  else
    print("[balatro_jev] wrote state phase=" .. tostring(st.phase))
  end
end

local function try_apply_action()
  if not config.IPC_DIR or not ipc_mod or not actions_mod then return end
  local body, err = ipc_mod.read_action(config.IPC_DIR)
  if not body then return end

  -- Soft JSON peek for decided_at / action without a full decoder.
  local decided = body:match('"decided_at"%s*:%s*"([^"]+)"')
  -- TODO: parse decided_at and reject if older than ACTION_MAX_AGE_SEC.

  local kind = body:match('"kind"%s*:%s*"([^"]+)"')
  local id = body:match('"id"%s*:%s*"([^"]+)"')
  if not kind then
    print("[balatro_jev] action.json missing kind")
    return
  end

  local ok, detail = actions_mod.apply({ id = id, kind = kind, params = {} })
  print("[balatro_jev] apply " .. tostring(kind) .. " ok=" .. tostring(ok) .. " " .. tostring(detail))
  ipc_mod.clear_action(config.IPC_DIR)
  last_state_hash = nil -- force re-dump after apply
end

-- Steamodded hooks — names may differ by SMODS version; keep defensive.
if SMODS and SMODS.current_mod then
  print("[balatro_jev] loaded; set IPC_DIR in config.lua to enable IPC")
end

-- Love update hook via Steamodded if available
local function on_update(_dt)
  frame = frame + 1
  if config.AUTO_DUMP and frame % math.max(1, config.ACTION_POLL_FRAMES) == 0 then
    dump_if_ready()
    try_apply_action()
  end
end

-- Export for manual testing / alternate hook registration
_G.BalatroJev = {
  dump = dump_if_ready,
  apply = try_apply_action,
  config = config,
  on_update = on_update,
}

-- Common SMODS pattern: register a game update callback when the API exists.
if SMODS and SMODS.add_callback then
  -- TODO: confirm callback name for current Steamodded release
  pcall(function()
    SMODS.add_callback("update", on_update)
  end)
end

return true
