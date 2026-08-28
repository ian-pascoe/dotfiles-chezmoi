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
  {
    'milanglacier/minuet-ai.nvim',
    opts = {
      provider = 'openai_compatible',
      request_timeout = 2.5,
      throttle = 1500,
      debounce = 600,
      provider_options = {
        openai_compatible = {
          api_key = function()
            local pi_auth_path = vim.fn.expand('~/.pi/agent/auth.json')
            local auth = vim.json.decode(table.concat(vim.fn.readfile(pi_auth_path), '\n'))
            return auth['opencode-go'].key
          end,
          end_point = 'https://opencode.ai/zen/go/v1/chat/completions',
          model = 'qwen3.8-flash',
          name = 'OpenCode Go',
          optional = {
            max_tokens = 56,
            top_p = 0.9,
            thinking = { type = 'disabled' },
          },
        },
      },
    },
  },
  {
    'saghen/blink.cmp',
    optional = true,
    opts = {
      sources = {
        default = { 'minuet' },
        providers = {
          minuet = {
            name = 'minuet',
            module = 'minuet.blink',
            async = true,
            timeout_ms = 2500,
            score_offset = 100,
          },
        },
      },
      completion = { trigger = { prefetch_on_insert = false } },
    },
  },
  {
    'nvim-lualine/lualine.nvim',
    optional = true,
    event = 'VeryLazy',
    opts = function(_, opts)
      table.insert(opts.sections.lualine_x, 2, {
        require('minuet.lualine'),
        icon = '󰚩',
      })
    end,
  },
}
