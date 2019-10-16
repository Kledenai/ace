/*
* @adonisjs/ace
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

import test from 'japa'
import { join } from 'path'
import { Filesystem } from '@adonisjs/dev-utils'

import { Kernel } from '../src/Kernel'
import { Manifest } from '../src/Manifest'
import { args } from '../src/Decorators/args'
import { flags } from '../src/Decorators/flags'
import { BaseCommand } from '../src/BaseCommand'

const fs = new Filesystem(join(__dirname, '__app'))

test.group('Kernel | register', () => {
  test('raise error when required argument comes after optional argument', (assert) => {
    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string({ required: false })
      public name: string

      @args.string()
      public age: string

      public async handle () {}
    }

    const kernel = new Kernel()
    const fn = () => kernel.register([Greet])
    assert.throw(fn, 'optional argument {name} must be after required argument {age}')
  })

  test('raise error when command name is missing', (assert) => {
    class Greet extends BaseCommand {
      public async handle () {}
    }

    const kernel = new Kernel()
    const fn = () => kernel.register([Greet])
    assert.throw(fn, 'missing command name for {Greet} class')
  })

  test('raise error when spread argument isn\'t the last one', (assert) => {
    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.spread()
      public files: string[]

      @args.string()
      public name: string

      public async handle () {}
    }

    const kernel = new Kernel()
    const fn = () => kernel.register([Greet])
    assert.throw(fn, 'spread argument {files} must be at last position')
  })

  test('register command', (assert) => {
    const kernel = new Kernel()

    class Install extends BaseCommand {
      public static commandName = 'install'
      public async handle () {}
    }

    class Greet extends BaseCommand {
      public static commandName = 'greet'
      public async handle () {}
    }

    kernel.register([Install, Greet])
    assert.deepEqual(kernel.commands, { install: Install, greet: Greet })
  })

  test('return command name suggestions for a given string', (assert) => {
    const kernel = new Kernel()

    class Install extends BaseCommand {
      public static commandName = 'install'
      public async handle () {}
    }

    class Greet extends BaseCommand {
      public static commandName = 'greet'
      public async handle () {}
    }

    kernel.register([Install, Greet])
    assert.deepEqual(kernel.getSuggestions('itall'), ['install'])
  })

  test('change camelCase alias name to dashcase', (assert) => {
    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @flags.boolean()
      public isAdmin: boolean

      public async handle () {}
    }

    assert.deepEqual(Greet.flags[0].name, 'is-admin')
  })
})

test.group('Kernel | find', () => {
  test('find relevant command from the commands list', async (assert) => {
    class Greet extends BaseCommand {
      public static commandName = 'greet'
      public async handle () {}
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const greet = await kernel.find(['greet'])
    assert.deepEqual(greet, Greet)
  })

  test('return null when unable to find command', async (assert) => {
    const kernel = new Kernel()
    const greet = await kernel.find(['greet'])

    assert.isNull(greet)
  })

  test('find command from manifest when manifestCommands exists', async (assert) => {
    const kernel = new Kernel()
    const manifest = new Manifest(fs.basePath)

    await fs.add(`ace-manifest.json`, JSON.stringify({
      greet: {
        commandName: 'greet',
        commandPath: 'Commands/Greet.ts',
      },
    }))

    await fs.add('Commands/Greet.ts', `export default class Greet {
      public static commandName = 'greet'
    }`)

    kernel.useManifest(manifest)
    kernel.manifestCommands = await manifest.load()

    const greet = await kernel.find(['greet'])
    assert.equal(greet!.name, 'Greet')

    await fs.cleanup()
  })

  test('execute before and after hook when finding command from manifest', async (assert) => {
    assert.plan(3)

    const kernel = new Kernel()
    const manifest = new Manifest(fs.basePath)

    await fs.add(`ace-manifest.json`, JSON.stringify({
      greet: {
        commandName: 'greet',
        commandPath: 'Commands/Greet.ts',
      },
    }))

    await fs.add('Commands/Greet.ts', `export default class Greet {
      public static commandName = 'greet'
    }`)

    kernel.useManifest(manifest)
    kernel.before('find', (command) => {
      assert.equal(command!.commandName, 'greet')
    })

    kernel.after('find', (command) => {
      assert.equal(command!.commandName, 'greet')
      assert.equal(command!['name'], 'Greet') // It is command constructor
    })

    kernel.manifestCommands = await manifest.load()

    await kernel.find(['greet'])
    await fs.cleanup()
  })

  test('pass null to before and after hook when unable to find command', async (assert) => {
    assert.plan(3)

    const kernel = new Kernel()
    kernel.before('find', (command) => assert.isNull(command))
    kernel.after('find', (command) => assert.isNull(command))

    const greet = await kernel.find(['greet'])

    assert.isNull(greet)
  })

  test('pass command constructor to before and after hook found command from local commands', async (assert) => {
    assert.plan(3)
    class Greet extends BaseCommand {
      public static commandName = 'greet'
      public async handle () {}
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    kernel.before('find', (command) => assert.deepEqual(command, Greet))
    kernel.after('find', (command) => assert.deepEqual(command, Greet))

    const greet = await kernel.find(['greet'])
    assert.deepEqual(greet, Greet)
  })
})

test.group('Kernel | handle', () => {
  test('raise exception when required argument is missing', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {}
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet']
    try {
      await kernel.handle(argv)
    } catch ({ message, argumentName, command }) {
      assert.equal(message, 'E_MISSING_ARGUMENT: missing required argument name')
      assert.equal(argumentName, 'name')
      assert.deepEqual(command, Greet)
    }
  })

  test('work fine when argument is missing and is optional', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string({ required: false })
      public name: string

      public async handle () {
        assert.deepEqual(this.parsed, { _: [] })
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet']
    await kernel.handle(argv)
  })

  test('work fine when required argument is defined', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'] })
        assert.equal(this.name, 'virk')
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    await kernel.handle(argv)
  })

  test('define spread arguments', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.spread()
      public files: string[]

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['foo.js', 'bar.js'] })
        assert.deepEqual(this.files, ['foo.js', 'bar.js'])
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'foo.js', 'bar.js']
    await kernel.handle(argv)
  })

  test('define spread arguments with regular arguments', async (assert) => {
    assert.plan(4)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @args.string()
      public age: string

      @args.spread()
      public files: string[]

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk', '22', 'foo.js', 'bar.js'] })
        assert.equal(this.name, 'virk')
        assert.equal(this.age, '22')
        assert.deepEqual(this.files, ['foo.js', 'bar.js'])
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '22', 'foo.js', 'bar.js']
    await kernel.handle(argv)
  })

  test('set arguments and flags', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean()
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '--admin']
    await kernel.handle(argv)
  })

  test('set arguments and flags when flag is defined with = sign', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean()
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '--admin=true']
    await kernel.handle(argv)
  })

  test('set arguments and flags when flag alias is passed', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean({ alias: 'a' })
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true, a: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '-a']
    await kernel.handle(argv)
  })

  test('set flag when it\'s name is different from command property', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean({ name: 'admin', alias: 'a' })
      public isAdmin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true, a: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.isAdmin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '-a']
    await kernel.handle(argv)
  })

  test('parse boolean flags as boolean always', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean()
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '--admin=true']
    await kernel.handle(argv)
  })

  test('parse boolean flags as boolean always also when aliases are defined', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean({ alias: 'a' })
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true, a: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '-a=true']
    await kernel.handle(argv)
  })

  test('do not override default value when flag is not defined', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.boolean({ default: true, alias: 'a' })
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], admin: true, a: true })
        assert.equal(this.name, 'virk')
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    await kernel.handle(argv)
  })

  test('parse flags as array when type is set to array', async (assert) => {
    assert.plan(3)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      @flags.array()
      public files: string[]

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'], files: ['foo.js'] })
        assert.equal(this.name, 'virk')
        assert.deepEqual(this.files, ['foo.js'])
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk', '--files=foo.js']
    await kernel.handle(argv)
  })

  test('register global flags', async (assert) => {
    assert.plan(2)

    const kernel = new Kernel()
    kernel.flag('env', (env, parsed) => {
      assert.equal(env, 'production')
      assert.deepEqual(parsed, { _: [], env: 'production' })
    }, { type: 'string' })

    const argv = ['--env=production']
    await kernel.handle(argv)
  })

  test('register global boolean flags', async (assert) => {
    assert.plan(2)

    const kernel = new Kernel()
    kernel.flag('ansi', (ansi, parsed) => {
      assert.equal(ansi, true)
      assert.deepEqual(parsed, { _: [], ansi: true })
    }, {})

    const argv = ['--ansi']
    await kernel.handle(argv)
  })

  test('register global reverse boolean flags', async (assert) => {
    assert.plan(2)

    const kernel = new Kernel()
    kernel.flag('ansi', (ansi, parsed) => {
      assert.equal(ansi, false)
      assert.deepEqual(parsed, { _: [], ansi: false })
    }, {})

    const argv = ['--no-ansi']
    await kernel.handle(argv)
  })

  test('do not execute string global flag when flag is not defined', async () => {
    const kernel = new Kernel()
    kernel.flag('env', () => {
      throw new Error('Not expected to be called')
    }, { type: 'string' })

    const argv = ['--ansi']
    await kernel.handle(argv)
  })

  test('do not execute array global flag when flag is not defined', async () => {
    const kernel = new Kernel()
    kernel.flag('env', () => {
      throw new Error('Not expected to be called')
    }, { type: 'array' })

    const argv = ['--ansi']
    await kernel.handle(argv)
  })

  test('do not execute num array type global flag when flag is not defined', async () => {
    const kernel = new Kernel()
    kernel.flag('env', () => {
      throw new Error('Not expected to be called')
    }, { type: 'numArray' })

    const argv = ['--ansi']
    await kernel.handle(argv)
  })

  test('pass command instance to the global flag, when flag is defined on a command', async (assert) => {
    assert.plan(3)
    const kernel = new Kernel()

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
      }
    }

    kernel.register([Greet])

    kernel.flag('env', (env, parsed, command) => {
      assert.equal(env, 'production')
      assert.deepEqual(parsed, { _: ['virk'], env: 'production' })
      assert.deepEqual(command, Greet)
    }, { type: 'string' })

    const argv = ['greet', 'virk', '--env=production']
    await kernel.handle(argv)
  })

  test('define arg name different from property name', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string({ name: 'theName' })
      public name: string

      public async handle () {
        assert.deepEqual(this.parsed, { _: ['virk'] })
        assert.equal(this.name, 'virk')
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    await kernel.handle(argv)
  })

  test('define flag name different from property name', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @flags.boolean({ name: 'isAdmin' })
      public admin: boolean

      public async handle () {
        assert.deepEqual(this.parsed, { _: [], isAdmin: true })
        assert.isTrue(this.admin)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', '--isAdmin']
    await kernel.handle(argv)
  })

  test('execute before and after run hooks', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @flags.boolean({ name: 'isAdmin' })
      public admin: boolean

      public async handle () {
      }
    }

    const kernel = new Kernel()
    kernel.before('run', (command) => {
      assert.instanceOf(command, Greet)
    })

    kernel.after('run', (command) => {
      assert.instanceOf(command, Greet)
    })

    kernel.register([Greet])

    const argv = ['greet']
    await kernel.handle(argv)
  })
})

test.group('Kernel | runCommand', () => {
  test('test logs in raw mode', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        this.logger.info(`Hello ${this.name}`)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)
    await kernel.runCommand(argv, commandInstance)

    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) Hello virk'])
  })

  test('test input prompt in raw mode', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const username = await this.prompt.ask('What\'s your username?', {
          name: 'username',
        })
        this.logger.info(username)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.answer('virk')
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) virk'])
  })

  test('test input prompt validation in raw mode', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const username = await this.prompt.ask('What\'s your username?', {
          name: 'username',
          validate (value) {
            return !!value
          },
        })

        this.logger.info(username)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.answer('')
    })

    commandInstance.prompt.on('prompt:error', (message) => {
      assert.equal(message, 'Enter the value')
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) '])
  })

  test('test choice prompt in raw mode', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const client = await this.prompt.choice('Select the installation client', ['npm', 'yarn'])
        this.logger.info(client)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.select(0)
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) npm'])
  })

  test('test choice prompt validation in raw mode', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const client = await this.prompt.choice('Select the installation client', ['npm', 'yarn'], {
          validate (answer) {
            return !!answer
          },
        })
        this.logger.info(client)
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.answer('')
    })

    commandInstance.prompt.on('prompt:error', (message) => {
      assert.equal(message, 'Enter the value')
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) '])
  })

  test('test multiple prompt in raw mode', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const clients = await this.prompt.multiple('Select the installation client', ['npm', 'yarn'])
        this.logger.info(clients.join(','))
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.select(0)
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) npm'])
  })

  test('test multiple prompt validation in raw mode', async (assert) => {
    assert.plan(2)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const client = await this.prompt.multiple('Select the installation client', ['npm', 'yarn'], {
          validate (answer) {
            return answer.length > 0
          },
        })

        this.logger.info(client.join(','))
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.answer([])
    })

    commandInstance.prompt.on('prompt:error', (message) => {
      assert.equal(message, 'Enter the value')
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) '])
  })

  test('test toggle prompt in raw mode', async (assert) => {
    assert.plan(1)

    class Greet extends BaseCommand {
      public static commandName = 'greet'

      @args.string()
      public name: string

      public async handle () {
        const deleteFile = await this.prompt.toggle('Delete the file?', ['Yep', 'Nope'])
        this.logger.info(deleteFile ? 'Yep' : 'Nope')
      }
    }

    const kernel = new Kernel()
    kernel.register([Greet])

    const argv = ['greet', 'virk']
    const command = await kernel.find(argv)
    const commandInstance = new command!(true)

    /**
     * Responding to prompt programatically
     */
    commandInstance.prompt.on('prompt', (prompt) => {
      prompt.accept()
    })

    await kernel.runCommand(argv, commandInstance)
    assert.deepEqual(commandInstance.logger.logs, ['underline(blue(info)) Yep'])
  })
})
