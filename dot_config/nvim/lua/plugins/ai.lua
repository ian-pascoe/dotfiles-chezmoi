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
      request_timeout = 10,
      n_completions = 3,
      throttle = 1500, -- Increase to reduce costs and avoid rate limits
      debounce = 600, -- Increase to reduce costs and avoid rate limits
      provider_options = {
        openai_compatible = {
          api_key = function()
            return 'local'
          end,
          end_point = '',
          model = 'gpt-5.6-sol',
          name = 'OpenAI Codex',
        },
      },
    },
    config = function(_, opts)
      local bridge_stdout = ''
      local bridge_stderr = ''
      local ready = false
      local bridge = vim.system({
        'node',
        vim.fn.stdpath('config') .. '/scripts/minuet-codex-bridge.ts',
        '0',
      }, {
        text = true,
        stdin = true,
        stdout = function(_, data)
          bridge_stdout = bridge_stdout .. (data or '')
          local port = tonumber(bridge_stdout:match('^(%d+)\n'))
          if port and not ready then
            ready = true
            vim.schedule(function()
              opts.provider_options.openai_compatible.end_point = ('http://127.0.0.1:%d/v1/chat/completions'):format(port)
              require('minuet').setup(opts)
            end)
          end
        end,
        stderr = function(_, data)
          bridge_stderr = bridge_stderr .. (data or '')
        end,
      }, function(result)
        if result.code ~= 0 and result.signal == 0 then
          vim.schedule(function()
            vim.notify('Minuet Codex bridge failed: ' .. bridge_stderr, vim.log.levels.ERROR)
          end)
        end
      end)

      vim.api.nvim_create_autocmd('VimLeavePre', {
        once = true,
        callback = function()
          pcall(bridge.kill, bridge, 15)
        end,
      })
    end,
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
