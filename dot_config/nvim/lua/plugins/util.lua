local function in_herdr()
  return vim.env.HERDR_PANE_ID ~= nil or vim.env.HERDR_ENV == '1' or vim.env.HERDR_SOCKET_PATH ~= nil
end

local function herdr_navigate(command, direction)
  return function()
    local before = vim.api.nvim_get_current_win()
    vim.cmd(command)

    if vim.api.nvim_get_current_win() ~= before then
      return
    end

    local herdr = vim.env.HERDR_BIN_PATH or 'herdr'
    if vim.fn.executable(herdr) ~= 1 then
      return
    end

    vim.fn.jobstart({ herdr, 'pane', 'focus', '--direction', direction, '--current' }, { detach = true })
  end
end

local herdr_navigation_keys = {
  { '<c-h>', herdr_navigate('TmuxNavigateLeft', 'left'), desc = 'Navigate left' },
  { '<c-j>', herdr_navigate('TmuxNavigateDown', 'down'), desc = 'Navigate down' },
  { '<c-k>', herdr_navigate('TmuxNavigateUp', 'up'), desc = 'Navigate up' },
  { '<c-l>', herdr_navigate('TmuxNavigateRight', 'right'), desc = 'Navigate right' },
}

local tmux_navigation_keys = {
  { '<c-h>', '<cmd><C-U>TmuxNavigateLeft<cr>' },
  { '<c-j>', '<cmd><C-U>TmuxNavigateDown<cr>' },
  { '<c-k>', '<cmd><C-U>TmuxNavigateUp<cr>' },
  { '<c-l>', '<cmd><C-U>TmuxNavigateRight<cr>' },
}

return {
  {
    'christoomey/vim-tmux-navigator',
    enabled = vim.env.TMUX ~= nil or in_herdr(),
    lazy = false,
    init = function()
      if in_herdr() then
        vim.g.tmux_navigator_no_mappings = 1
      end
    end,
    keys = in_herdr() and herdr_navigation_keys or tmux_navigation_keys,
  },
  {
    'swaits/zellij-nav.nvim',
    enabled = vim.env.ZELLIJ ~= nil,
    lazy = false,
    keys = {
      { '<c-h>', '<cmd>ZellijNavigateLeftTab<cr>', { mode = { 'n', 't' }, silent = true, desc = 'navigate left or tab' } },
      { '<c-j>', '<cmd>ZellijNavigateDown<cr>', { mode = { 'n', 't' }, silent = true, desc = 'navigate down' } },
      { '<c-k>', '<cmd>ZellijNavigateUp<cr>', { mode = { 'n', 't' }, silent = true, desc = 'navigate up' } },
      { '<c-l>', '<cmd>ZellijNavigateRightTab<cr>', { mode = { 'n', 't' }, silent = true, desc = 'navigate right or tab' } },
    },
    opts = {},
  },
  { -- vim learning game
    'ThePrimeagen/vim-be-good',
    cmd = 'VimBeGood',
  },
  {
    'ThePrimeagen/refactoring.nvim',
    dependencies = {
      'lewis6991/async.nvim',
    },
    lazy = false,
  },
}
