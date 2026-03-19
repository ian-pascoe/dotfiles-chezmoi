return {
  {
    'neovim/nvim-lspconfig',
    opts = {
      servers = {
        nil_ls = {
          enabled = not LazyVim.is_win(), -- disable on windows
          mason = false, -- installed via nix
          cmd = { 'nil' },
        },
      },
    },
  },
  {
    'stevearc/conform.nvim',
    opts = {
      formatters_by_ft = {
        nix = { 'nixfmt' },
      },
    },
  },
}
