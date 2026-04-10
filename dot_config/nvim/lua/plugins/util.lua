return {
  {
    'christoomey/vim-tmux-navigator',
    enabled = vim.env.TMUX ~= nil,
    lazy = false,
    keys = {
      { '<c-h>', '<cmd><C-U>TmuxNavigateLeft<cr>' },
      { '<c-j>', '<cmd><C-U>TmuxNavigateDown<cr>' },
      { '<c-k>', '<cmd><C-U>TmuxNavigateUp<cr>' },
      { '<c-l>', '<cmd><C-U>TmuxNavigateRight<cr>' },
    },
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
}
