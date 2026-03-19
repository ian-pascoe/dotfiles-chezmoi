return {
  {
    'mason-org/mason.nvim',
    opts = {
      ensure_installed = { 'shfmt' },
    },
  },
  {
    'neovim/nvim-lspconfig',
    opts = {
      servers = {
        bashls = {
          filetypes = { 'sh', 'bash', 'zsh', 'csh', 'ksh' },
        },
      },
    },
  },
  {
    'stevearc/conform.nvim',
    opts = {
      formatters_by_ft = {
        sh = { 'shfmt' },
        bash = { 'shfmt' },
        zsh = { 'shfmt' },
        csh = { 'shfmt' },
        ksh = { 'shfmt' },
      },
    },
  },
}
