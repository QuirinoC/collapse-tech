--- STEAMODDED HEADER
--- MOD_NAME: Balatro Jev Bridge
--- MOD_ID: balatro_jev
--- MOD_AUTHOR: [Collapse Tech]
--- MOD_DESCRIPTION: Dump game state JSON and apply Jev-chosen actions for apps/balatro-jev.
--- PRIORITY: 0
--- BADGE_COLOUR: A020F0
--- PREFIX: bjev
--- VERSION: 0.1.0
----------------------------------------------
------------ MOD CODE ------------------------

-- IPC files land in the Love2D save directory under balatro_jev/
-- Point BALATRO_JEV_IPC_DIR at that folder (or copy files) for the TS bridge.
local IPC_DIR = "balatro_jev"
local STATE_FILE = IPC_DIR .. "/state.json"
local ACTION_FILE = IPC_DIR .. "/action.json"
local ACTION_APPLIED_FILE = IPC_DIR .. "/action.applied"

local function ensure_dir()
  -- love.filesystem.createDirectory is available in Balatro's Love2D runtime
  if love and love.filesystem and love.filesystem.createDirectory then
    love.filesystem.createDirectory(IPC_DIR)
  end
end

-- Minimal JSON encoder for our flat-ish state tables.
-- TODO: swap for a battle-tested encoder if one is already loaded by Steamodded.
local function json_escape(s)
  s = tostring(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub("\"", "\\\"")
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
    return "\"" .. json_escape(v) .. "\""
  elseif t == "table" then
    -- array?
    local is_array = true
    local n = 0
    for k, _ in pairs(v) do
      if type(k) ~= "number" then
        is_array = false
        break
      end
      if k > n then n = k end
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
        parts[#parts + 1] = "\"" .. json_escape(k) .. "\":" .. to_json(val)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

local function write_file(path, contents)
  ensure_dir()
  if love and love.filesystem and love.filesystem.write then
    love.filesystem.write(path, contents)
    return true
  end
  -- Fallback for out-of-game tests
  local f = io.open(path, "w")
  if not f then return false end
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
  if not f then return nil end
  local data = f:read("*a")
  f:close()
  return data
end

local function map_phase()
  if not (G and G.STATE and G.STATES) then
    return "unknown"
  end
  local st = G.STATE
  if st == G.STATES.BLIND_SELECT then
    return "blind_select"
  elseif st == G.STATES.SELECTING_HAND
    or st == G.STATES.HAND_PLAYED
    or st == G.STATES.DRAW_TO_HAND then
    return "hand"
  elseif st == G.STATES.SHOP then
    return "shop"
  elseif st == G.STATES.ROUND_EVAL then
    return "round_eval"
  elseif st == G.STATES.GAME_OVER then
    return "game_over"
  end
  return "unknown"
end

local function highlight_hand_indices(idxs)
  if not (G and G.hand and G.hand.cards and G.STATE == G.STATES.SELECTING_HAND) then
    return false, "not in SELECTING_HAND"
  end
  if type(idxs) ~= "table" or #idxs < 1 then
    return false, "empty card_indices"
  end
  if G.hand.unhighlight_all then
    G.hand:unhighlight_all()
  end
  local limit = (G.hand.config and G.hand.config.highlighted_limit) or 5
  local n = 0
  for _, zero_idx in ipairs(idxs) do
    local i = tonumber(zero_idx)
    if i == nil then return false, "non-numeric card index" end
    local card = G.hand.cards[i + 1]
    if not card then return false, "card index out of range: " .. tostring(i) end
    if n >= limit then break end
    G.hand:add_to_highlighted(card)
    n = n + 1
  end
  if n < 1 then return false, "no cards highlighted" end
  return true, nil
end

--- Snapshot from Balatro globals (G.STATE / G.GAME / G.hand / G.jokers).
local function dump_state()
  local state = {
    version = 1,
    phase = map_phase(),
    ante = 1,
    round = 1,
    money = 0,
    hand = {},
    jokers = {},
    notes = "balatro_jev dump",
  }

  if G and G.GAME then
    state.ante = (G.GAME.round_resets and G.GAME.round_resets.ante) or G.GAME.ante or state.ante
    state.round = G.GAME.round or state.round
    state.money = G.GAME.dollars or state.money
    state.hands_left = G.GAME.current_round and G.GAME.current_round.hands_left or nil
    state.discards_left = G.GAME.current_round and G.GAME.current_round.discards_left or nil
    if G.GAME.blind and G.GAME.blind.chips then
      state.chips_needed = G.GAME.blind.chips
    end
    state.chips_scored = G.GAME.chips
  end

  if G and G.hand and G.hand.cards then
    for i, card in ipairs(G.hand.cards) do
      local rank = (card.base and card.base.value) or "?"
      local suit = (card.base and card.base.suit) or "?"
      state.hand[#state.hand + 1] = {
        index = i - 1,
        rank = tostring(rank),
        suit = tostring(suit),
        enhancement = card.ability and card.ability.effect or nil,
        edition = card.edition and card.edition.type or nil,
        seal = card.seal,
      }
    end
  end

  if G and G.jokers and G.jokers.cards then
    for i, j in ipairs(G.jokers.cards) do
      state.jokers[#state.jokers + 1] = {
        index = i - 1,
        id = (j.config and j.config.center and j.config.center.key) or "unknown",
        name = (j.config and j.config.center and j.config.center.name) or "Joker",
      }
    end
  end

  -- Optional: precompute legal_actions in Lua later; TS derives for now.
  -- TODO: enumerate blinds (G.GAME.round_resets.blind_choices) and shop offers.
  return state
end

local function apply_action(action)
  if not action or not action.kind then
    return false, "missing action.kind"
  end

  local kind = action.kind
  local params = action.params or {}
  local idxs = params.card_indices or params.indices or {}

  if kind == "noop" then
    return true, "noop"
  elseif kind == "play_hand" then
    local ok, err = highlight_hand_indices(idxs)
    if not ok then return false, err end
    if not (G.FUNCS and G.FUNCS.play_cards_from_highlighted) then
      return false, "play_cards_from_highlighted missing"
    end
    G.FUNCS.play_cards_from_highlighted()
    return true, "played"
  elseif kind == "discard" then
    local ok, err = highlight_hand_indices(idxs)
    if not ok then return false, err end
    if not (G.FUNCS and G.FUNCS.discard_cards_from_highlighted) then
      return false, "discard_cards_from_highlighted missing"
    end
    G.FUNCS.discard_cards_from_highlighted()
    return true, "discarded"
  elseif kind == "select_blind" then
    -- TODO: G.FUNCS.select_blind(e) needs blind-select UI e.config.ref_table
    return false, "TODO: select_blind needs UI e.config.ref_table"
  elseif kind == "skip_blind" then
    -- TODO: G.FUNCS.skip_blind(e) needs e.UIBox tag_container
    return false, "TODO: skip_blind needs UI e.UIBox"
  elseif kind == "buy" then
    -- TODO: G.FUNCS.buy_from_shop(e) with shop Card as e.config.ref_table
    return false, "TODO: buy needs shop Card ref"
  elseif kind == "reroll" then
    if G.FUNCS and G.FUNCS.reroll_shop then
      local ok, err = pcall(function() G.FUNCS.reroll_shop({}) end)
      if ok then return true, "rerolled" end
      return false, tostring(err)
    end
    return false, "reroll_shop missing"
  elseif kind == "cash_out" then
    if G.STATE == G.STATES.ROUND_EVAL and G.FUNCS.cash_out then
      local ok, err = pcall(function() G.FUNCS.cash_out({ config = {} }) end)
      if ok then return true, "cash_out" end
      return false, tostring(err)
    end
    if G.STATE == G.STATES.SHOP and G.FUNCS.toggle_shop then
      local ok, err = pcall(function() G.FUNCS.toggle_shop({ config = {} }) end)
      if ok then return true, "toggle_shop" end
      return false, "TODO: leave shop — " .. tostring(err)
    end
    return false, "TODO: cash_out / leave shop"
  elseif kind == "use_consumable" then
    return false, "TODO: use_consumable needs Card UI ref"
  elseif kind == "sell" then
    return false, "TODO: sell needs Card UI ref"
  end

  return false, "unknown kind " .. tostring(kind)
end

-- Tiny JSON object peek (not a full parser). Expects action.json from the TS bridge.
local function peek_action_kind(json)
  if not json then return nil end
  local kind = json:match("\"kind\"%s*:%s*\"([^\"]+)\"")
  local id = json:match("\"id\"%s*:%s*\"([^\"]+)\"")
  local indices = {}
  local block = json:match("\"card_indices\"%s*:%s*%[([^%]]*)%]")
  if block then
    for n in block:gmatch("(%d+)") do
      indices[#indices + 1] = tonumber(n)
    end
  end
  return {
    id = id,
    kind = kind,
    params = { card_indices = indices },
  }
end

local last_dump = 0
local DUMP_INTERVAL = 1.0 -- seconds

local function tick(dt)
  last_dump = last_dump + (dt or 0)
  if last_dump >= DUMP_INTERVAL then
    last_dump = 0
    local ok, err = pcall(function()
      local state = dump_state()
      write_file(STATE_FILE, to_json(state))
    end)
    if not ok then
      print("[balatro_jev] dump failed: " .. tostring(err))
    end
  end

  local raw = read_file(ACTION_FILE)
  if raw then
    local applied = read_file(ACTION_APPLIED_FILE)
    -- Apply once per distinct payload
    if applied ~= raw then
      local action = peek_action_kind(raw)
      local ok, msg = apply_action(action)
      print("[balatro_jev] apply " .. tostring(action and action.kind) .. " => " .. tostring(msg))
      if ok then
        write_file(ACTION_APPLIED_FILE, raw)
      end
      -- Even on TODO failures we stamp applied to avoid spin; remove when wired.
      if not ok and msg and msg:match("^TODO") then
        write_file(ACTION_APPLIED_FILE, raw)
      end
    end
  end
end

-- Prefer Steamodded lifecycle hooks when present.
if SMODS and SMODS.current_mod then
  local mod = SMODS.current_mod
  -- TODO: confirm exact Steamodded callback names for your SMODS version
  if mod.set_debuff then
    -- no-op binder to keep header tools happy
  end
end

-- Love2D update hook — may need Lovely / Steamodded wrapper depending on loader.
local _update = love and love.update
if love then
  function love.update(dt)
    if _update then _update(dt) end
    tick(dt)
  end
end

print("[balatro_jev] loaded — writing " .. STATE_FILE)

----------------------------------------------
------------ MOD CODE END --------------------
