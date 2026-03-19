return {
  {
    'mason-org/mason.nvim',
    opts = {
      ensure_installed = { 'kdlfmt' },
    },
  },
  {
    'stevearc/conform.nvim',
    opts = {
      formatters_by_ft = {
        kdl = { 'kdlfmt' },
      },
    },
  },
}
