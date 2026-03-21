return {
  {
    'neovim/nvim-lspconfig',
    opts = {
      ---@type table<string, vim.lsp.Config>
      servers = {
        oxlint = {},
      },
    },
  },
}
