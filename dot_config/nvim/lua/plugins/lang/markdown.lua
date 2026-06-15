return {
  {
    'neovim/nvim-lspconfig',
    opts = {
      ---@module 'lazyvim'
      ---@type table<string, lazyvim.lsp.Config>
      servers = {
        remark_ls = {
          settings = {
            remark = {
              requireConfig = true,
            },
          },
        },
      },
    },
  },
}
