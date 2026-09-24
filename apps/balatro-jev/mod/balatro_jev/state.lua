-- Build versioned JSON-ish Lua tables matching apps/balatro-jev/src/types.ts
-- Steamodded / Balatro APIs vary by game version — TODOs mark integration points.

local M = {}

local function safe(fn, fallback)
  local ok, val = pcall(fn)
  if ok then return val end
  return fallback
end

--- @return table BalatroState v1
function M.dump()
  -- TODO: replace with real G.GAME / G.hand / G.jokers reads under Steamodded.
  local phase = "unknown"
  local ante = 1
  local round = 1
  local money = 0
  local chips_needed, chips_scored, hands_left, discards_left
  local hand, jokers, blinds, shop, selected, legal_actions

  if G and G.STATE then
    -- Heuristic mapping; verify against current Balatro enums.
    local st = G.STATE
    if st == G.STATES.BLIND_SELECT then
      phase = "blind_select"
    elseif st == G.STATES.SELECTING_HAND or st == G.STATES.HAND_PLAYED or st == G.STATES.DRAW_TO_HAND then
      phase = "hand"
    elseif st == G.STATES.SHOP then
      phase = "shop"
    elseif st == G.STATES.GAME_OVER then
      phase = "game_over"
    end
  end

  if G and G.GAME then
    ante = safe(function() return G.GAME.round_resets.ante end, ante)
    round = safe(function() return G.GAME.round end, round)
    money = safe(function() return G.GAME.dollars end, money)
    chips_needed = safe(function() return G.GAME.blind.chips end, nil)
    chips_scored = safe(function() return G.GAME.chips end, nil)
    hands_left = safe(function() return G.GAME.current_round.hands_left end, nil)
    discards_left = safe(function() return G.GAME.current_round.discards_left end, nil)
  end

  -- Hand cards
  hand = {}
  if G and G.hand and G.hand.cards then
    for i, card in ipairs(G.hand.cards) do
      hand[#hand + 1] = {
        index = i - 1,
        rank = safe(function() return card.base.value end, "?"),
        suit = safe(function() return card.base.suit end, "?"),
        enhancement = safe(function() return card.ability and card.ability.effect end, nil),
        edition = safe(function() return card.edition and card.edition.type end, nil),
        seal = safe(function() return card.seal end, nil),
      }
    end
  end

  selected = {}
  if G and G.hand and G.hand.highlighted and G.hand.cards then
    for _, hcard in ipairs(G.hand.highlighted) do
      for i, card in ipairs(G.hand.cards) do
        if card == hcard then
          selected[#selected + 1] = i - 1
          break
        end
      end
    end
  end

  jokers = {}
  if G and G.jokers and G.jokers.cards then
    for i, j in ipairs(G.jokers.cards) do
      jokers[#jokers + 1] = {
        index = i - 1,
        id = safe(function() return j.config.center.key end, "unknown"),
        name = safe(function() return j.ability and j.ability.name or j.config.center.name end, "Joker"),
      }
    end
  end

  -- Blinds / shop: leave nil so the Node bridge derives legal actions from phase.
  -- TODO: enumerate selectable blinds and shop offers with stable ids.

  return {
    version = 1,
    phase = phase,
    ante = ante,
    round = round,
    money = money,
    chips_needed = chips_needed,
    chips_scored = chips_scored,
    hands_left = hands_left,
    discards_left = discards_left,
    hand_size = hand and #hand or nil,
    hand = #hand > 0 and hand or nil,
    selected = #selected > 0 and selected or nil,
    jokers = #jokers > 0 and jokers or nil,
    blinds = blinds,
    shop = shop,
    legal_actions = legal_actions,
    notes = "dumped by balatro_jev Lua mod; verify Steamodded field paths",
  }
end

return M
