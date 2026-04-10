return {
  {
    'nvim-treesitter/nvim-treesitter',
    opts = {
      ensure_installed = { 'xml' },
    },
  },
  {
    'neovim/nvim-lspconfig',
    opts = {
      servers = {
        lemminx = {
          filetypes = { 'xml', 'xsd', 'wsdl', 'svg', 'plist' },
        },
      },
    },
  },
}
