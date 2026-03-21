---@param dir "h"|"j"|"k"|"l"|nil the direction to navigate
---@return fun() function to navigate in the given direction
local function smart_nav(dir)
  return function()
    local ss = require('smart-splits')
    if dir == 'h' then
      return vim.schedule(ss.move_cursor_left)
    elseif dir == 'j' then
      return vim.schedule(ss.move_cursor_down)
    elseif dir == 'k' then
      return vim.schedule(ss.move_cursor_up)
    elseif dir == 'l' then
      return vim.schedule(ss.move_cursor_right)
    else
      return vim.schedule(ss.move_cursor_previous)
    end
  end
end

return {
  { -- smart nav
    'mrjones2014/smart-splits.nvim',
    lazy = false,
    opts = {
      zellij_move_focus_or_tab = true,
    },
    keys = {
      { '<C-h>', smart_nav('h'), desc = 'Move to left split' },
      { '<C-j>', smart_nav('j'), desc = 'Move to down split' },
      { '<C-k>', smart_nav('k'), desc = 'Move to up split' },
      { '<C-l>', smart_nav('l'), desc = 'Move to right split' },
    },
  },
  { -- smart nav in snacks terminals
    'folke/snacks.nvim',
    dependencies = { 'mrjones2014/smart-splits.nvim' },
    opts = {
      terminal = {
        win = {
          keys = {
            nav_h = { '<C-h>', smart_nav('h'), desc = 'Go to Left Window', expr = true, mode = 't' },
            nav_j = { '<C-j>', smart_nav('j'), desc = 'Go to Lower Window', expr = true, mode = 't' },
            nav_k = { '<C-k>', smart_nav('k'), desc = 'Go to Upper Window', expr = true, mode = 't' },
            nav_l = { '<C-l>', smart_nav('l'), desc = 'Go to Right Window', expr = true, mode = 't' },
          },
        },
      },
    },
  },
  { -- smart nav in sidekick cli
    'folke/sidekick.nvim',
    dependencies = { 'mrjones2014/smart-splits.nvim' },
    opts = {
      cli = {
        win = {
          keys = {
            nav_h = { '<C-h>', smart_nav('h'), desc = 'Go to Left Window', expr = true, mode = 't' },
            nav_j = { '<C-j>', smart_nav('j'), desc = 'Go to Lower Window', expr = true, mode = 't' },
            nav_k = { '<C-k>', smart_nav('k'), desc = 'Go to Upper Window', expr = true, mode = 't' },
            nav_l = { '<C-l>', smart_nav('l'), desc = 'Go to Right Window', expr = true, mode = 't' },
          },
        },
      },
    },
  },
  { -- vim learning game
    'ThePrimeagen/vim-be-good',
    cmd = 'VimBeGood',
  },
}
