return {
  {
    'folke/sidekick.nvim',
    ---@module "sidekick"
    ---@type sidekick.Config
    opts = {
      nes = {
        enabled = false,
      },
      copilot = {
        status = {
          enabled = false,
        },
      },
      cli = {
        tools = {
          omp = {
            cmd = { 'omp' },
            is_proc = '\\<omp\\>',
            resume = { '--resume' },
            continue = { '--continue' },
            url = 'https://omp.sh',
            native_scroll = false,
          },
        },
      },
    },
    config = function(_, opts)
      require('sidekick').setup(opts)
      if vim.env.HERDR_ENV == '1' and vim.fn.executable('herdr') == 1 then
        require('sidekick.cli.session').register('herdr', require('config.sidekick_herdr'))
      end
    end,
  },
}
