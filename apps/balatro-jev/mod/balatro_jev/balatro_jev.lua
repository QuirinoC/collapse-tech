--- STEAMODDED HEADER
--- MOD_NAME: Balatro Jev Bridge
--- MOD_ID: balatro_jev
--- MOD_AUTHOR: [Collapse Tech]
--- MOD_DESCRIPTION: Dump game state JSON and apply Jev-chosen actions for apps/balatro-jev.
--- PRIORITY: 0
--- BADGE_COLOUR: E85D04
--- PREFIX: bjev
--- VERSION: 0.2.1
----------------------------------------------
------------ MOD CODE ------------------------

-- IPC under Love2D save dir: balatro_jev/{state,action}.json
-- Point BALATRO_JEV_IPC_DIR at that folder for the TS bridge.
--
-- CRITICAL: do NOT rely solely on wrapping love.update at load time.
-- Steamodded / main.lua replace love.update and Game.update after mods load.
-- We re-hook Game.update so dump/apply keep running for the whole session.

local IPC_DIR = "balatro_jev"
local STATE_FILE = IPC_DIR .. "/state.json"
local ACTION_FILE = IPC_DIR .. "/action.json"
local ACTION_APPLIED_FILE = IPC_DIR .. "/action.applied"
local ACTION_RESULT_FILE = IPC_DIR .. "/action_result.json"
local HEARTBEAT_FILE = IPC_DIR .. "/heartbeat.txt"

local function load_mod_file(name)
  if SMODS and SMODS.load_file then
    local ok, mod = pcall(function()
      return SMODS.load_file(name)()
    end)
    if ok and type(mod) == "table" then
      return mod
    end
  end
  local ok2, mod2 = pcall(function()
    return require(name:gsub("%.lua$", ""))
  end)
  if ok2 and type(mod2) == "table" then
    return mod2
  end
  return nil
end

-- Reloaded on each dump/apply so state.lua / actions.lua edits take effect
-- without a full Balatro restart (SMODS.load_file re-executes the chunk).
local state_mod = load_mod_file("state.lua")
local actions_mod = load_mod_file("actions.lua")

local function refresh_mods()
  local s = load_mod_file("state.lua")
  if s then
    state_mod = s
  end
  local a = load_mod_file("actions.lua")
  if a then
    actions_mod = a
  end
end

local function ensure_dir()
  if love and love.filesystem and love.filesystem.createDirectory then
    love.filesystem.createDirectory(IPC_DIR)
  end
end

local function json_escape(s)
  s = tostring(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub('"', '\\"')
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  s = s:gsub("\t", "\\t")
  return s
end

local function to_json(v)
  local t = type(v)
  if t == "nil" then
    return "null"
  elseif t == "boolean" then
    return v and "true" or "false"
  elseif t == "number" then
    return tostring(v)
  elseif t == "string" then
    return '"' .. json_escape(v) .. '"'
  elseif t == "table" then
    local is_array = true
    local n = 0
    for k, _ in pairs(v) do
      if type(k) ~= "number" then
        is_array = false
        break
      end
      if k > n then
        n = k
      end
    end
    if is_array then
      local parts = {}
      for i = 1, n do
        parts[#parts + 1] = to_json(v[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, val in pairs(v) do
        parts[#parts + 1] = '"' .. json_escape(k) .. '":' .. to_json(val)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

local function write_file(path, contents)
  ensure_dir()
  if love and love.filesystem and love.filesystem.write then
    local ok, err = love.filesystem.write(path, contents)
    return ok and true or false, err
  end
  local f = io.open(path, "w")
  if not f then
    return false, "io.open failed"
  end
  f:write(contents)
  f:close()
  return true
end

local function read_file(path)
  if love and love.filesystem and love.filesystem.read then
    if love.filesystem.getInfo and not love.filesystem.getInfo(path) then
      return nil
    end
    return love.filesystem.read(path)
  end
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local data = f:read("*a")
  f:close()
  return data
end

local function match_str(json, key)
  return json:match('"' .. key .. '"%s*:%s*"([^"]*)"')
end

local function match_num(json, key)
  return tonumber(json:match('"' .. key .. '"%s*:%s*(-?%d+%.?%d*)'))
end

local function match_num_array(json, key)
  local block = json:match('"' .. key .. '"%s*:%s*%[([^%]]*)%]')
  local out = {}
  if not block then
    return out
  end
  for n in block:gmatch("(%-?%d+)") do
    out[#out + 1] = tonumber(n)
  end
  return out
end

local function parse_action(json)
  if not json then
    return nil
  end
  local kind = match_str(json, "kind")
  if not kind then
    return nil
  end
  return {
    id = match_str(json, "id"),
    kind = kind,
    label = match_str(json, "label"),
    params = {
      card_indices = match_num_array(json, "card_indices"),
      shop_index = match_num(json, "shop_index"),
      shop_slot = match_num(json, "shop_slot"),
      shop_area = match_str(json, "shop_area"),
      blind_id = match_str(json, "blind_id"),
      native_key = match_str(json, "native_key"),
      index = match_num(json, "index"),
      pack_index = match_num(json, "pack_index"),
      target = match_str(json, "target"),
      item_id = match_str(json, "item_id"),
      item_kind = match_str(json, "item_kind"),
    },
  }
end

local function dump_state()
  refresh_mods()
  if state_mod and state_mod.dump then
    return state_mod.dump()
  end
  return {
    version = 1,
    phase = "unknown",
    ante = 1,
    round = 1,
    money = 0,
    notes = "state.lua missing",
  }
end

local function apply_action(action)
  refresh_mods()
  if actions_mod and actions_mod.apply then
    return actions_mod.apply(action)
  end
  return false, "actions.lua missing"
end

local last_dump = 0
local DUMP_INTERVAL = 0.5
local last_phase = nil
local tick_count = 0
local last_heartbeat = 0
local hooked_game_update = nil
local hook_attempts = 0

local function try_apply()
  local raw = read_file(ACTION_FILE)
  if not raw then
    return
  end
  local applied = read_file(ACTION_APPLIED_FILE)
  if applied == raw then
    return
  end

  local action = parse_action(raw)
  print(
    "[balatro_jev] APPLY request kind="
      .. tostring(action and action.kind)
      .. " id="
      .. tostring(action and action.id)
      .. " blind_id="
      .. tostring(action and action.params and action.params.blind_id)
      .. " native_key="
      .. tostring(action and action.params and action.params.native_key)
  )

  local applied_ok, detail = false, "no action"
  local ok, a, b = pcall(function()
    return apply_action(action)
  end)
  if not ok then
    applied_ok, detail = false, "apply threw: " .. tostring(a)
  else
    applied_ok, detail = a, b
  end

  print(
    "[balatro_jev] APPLY result kind="
      .. tostring(action and action.kind)
      .. " ok="
      .. tostring(applied_ok)
      .. " detail="
      .. tostring(detail)
  )
  write_file(
    ACTION_RESULT_FILE,
    to_json({
      ok = applied_ok and true or false,
      kind = action and action.kind or nil,
      id = action and action.id or nil,
      detail = tostring(detail),
      at = os.time(),
      raw_state = G and G.STATE or nil,
      has_blind_select = G and G.blind_select ~= nil or false,
    })
  )
  write_file(ACTION_APPLIED_FILE, raw)
end

local function tick_main(dt)
  tick_count = tick_count + 1
  last_dump = last_dump + (dt or 0)
  last_heartbeat = last_heartbeat + (dt or 0)

  if last_heartbeat >= 2.0 then
    last_heartbeat = 0
    local phase = "?"
    local raw = "?"
    pcall(function()
      if G and G.STATE and G.STATES then
        raw = tostring(G.STATE)
        for name, val in pairs(G.STATES) do
          if val == G.STATE then
            phase = name
            break
          end
        end
      end
    end)
    write_file(
      HEARTBEAT_FILE,
      string.format(
        "t=%s ticks=%d raw_state=%s state_name=%s blind_select=%s\n",
        tostring(os.time()),
        tick_count,
        raw,
        phase,
        tostring(G and G.blind_select ~= nil)
      )
    )
  end

  if last_dump >= DUMP_INTERVAL then
    last_dump = 0
    local ok, err = pcall(function()
      local state = dump_state()
      local wok, werr = write_file(STATE_FILE, to_json(state))
      if not wok then
        print("[balatro_jev] write_state FAILED: " .. tostring(werr))
      end
      if state.phase ~= last_phase then
        print(
          "[balatro_jev] phase="
            .. tostring(state.phase)
            .. " raw="
            .. tostring(state.raw_state)
            .. " blinds="
            .. tostring(state.blinds and #state.blinds or 0)
            .. " blind_select_ui="
            .. tostring(G and G.blind_select ~= nil)
        )
        last_phase = state.phase
      end
    end)
    if not ok then
      print("[balatro_jev] dump failed: " .. tostring(err))
    end
  end

  try_apply()
end

local function install_game_update_hook()
  if not Game or type(Game.update) ~= "function" then
    return false
  end
  if hooked_game_update == Game.update then
    return true
  end
  local prev = Game.update
  function Game:update(dt)
    prev(self, dt)
    local ok, err = pcall(tick_main, dt)
    if not ok then
      print("[balatro_jev] tick error: " .. tostring(err))
    end
  end
  hooked_game_update = Game.update
  print("[balatro_jev] hooked Game:update")
  return true
end

local function ensure_hooks(dt)
  hook_attempts = hook_attempts + 1
  if install_game_update_hook() then
    return
  end
  local ok, err = pcall(tick_main, dt or 0)
  if not ok then
    print("[balatro_jev] tick error: " .. tostring(err))
  end
  if hook_attempts == 1 or hook_attempts % 120 == 0 then
    print("[balatro_jev] waiting to hook Game:update (attempt " .. tostring(hook_attempts) .. ")")
  end
end

local function wrap_love_update()
  if not love then
    return
  end
  local current = love.update
  if current and current.__balatro_jev then
    return
  end
  local prev = current
  local wrapper
  wrapper = function(dt)
    if prev then
      prev(dt)
    end
    if love.update ~= wrapper then
      wrap_love_update()
    end
    ensure_hooks(dt)
  end
  wrapper.__balatro_jev = true
  love.update = wrapper
  print("[balatro_jev] wrapped love.update")
end

wrap_love_update()

_G.BalatroJev = {
  dump = dump_state,
  apply = apply_action,
  tick = tick_main,
  ensure_hooks = ensure_hooks,
}

print("[balatro_jev] loaded — writing " .. STATE_FILE .. " (v0.2.1 Game:update hook)")

----------------------------------------------
------------ MOD CODE END --------------------
