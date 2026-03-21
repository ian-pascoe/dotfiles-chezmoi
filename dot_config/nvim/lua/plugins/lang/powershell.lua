return {
  {
    'neovim/nvim-lspconfig',
    opts = {
      servers = {
        powershell_es = {},
      },
      setup = {
        -- setup via powershell.nvim
        powershell_es = function()
          return true
        end,
      },
    },
  },
  {
    'TheLeoP/powershell.nvim',
    enabled = vim.fn.executable('pwsh') == 1,
    ft = { 'ps1', 'psm1', 'psd1', 'pwsh' },
    opts = {
      bundle_path = vim.fn.stdpath('data') .. '/mason/packages/powershell-editor-services',
      init_options = {
        enableProfileLoading = false,
      },
      settings = {
        powershell = {
          codeFormatting = {
            preset = 'OTBS',
          },
        },
      },
    },
  },
}
