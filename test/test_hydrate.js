import tap from 'tap';
import assert from 'assert';
import * as h20 from '../src/index';

let finishedOne;
let stopCount = 0;

class FakeNoStart {
  constructor() {
    this.foo = true;
  }
}

class FakeNullStart {
  start() { return this.itsNull; }
}

async function regularFunction(arg1, arg2) {
  await new Promise(accept => setTimeout(accept, 1));
  return [arg1, arg2].join(',');
}

class FakeHydro {
  constructor(context, config) {
    assert(context.foo, 'Should get context');
    assert(config.which, 'Should have a "which" property');
    this.which = config.which;
  }

  async start(context) {
    assert(!finishedOne, 'Should start in parallel');
    assert(context.foo, 'Should get context');
    await new Promise(accept => setTimeout(accept, 10));
    return { id: this.which };
  }

  async stop(context) {
    assert(context.foo, 'Should get context');
    assert(this.which, 'Should have a "which" property');
    await new Promise(accept => setTimeout(accept, 10));
    stopCount += 1;
  }
}

tap.test('should hydrate and dehydrate', async (t) => {
  const inProc = {};
  const { allObjects, tree } = await h20.hydrate({
    foo: true,
    logger: {
      info() {},
    },
  }, {
    testing: {
      sub: {
        module: FakeHydro,
        which: 1,
      },
    },
    top: {
      module: FakeHydro,
      which: 2,
    },
    nostart: {
      module: FakeNoStart,
    },
    nullstart: {
      module: FakeNullStart,
    },
    disabled: {
      enabled: false,
      module: 'totallyFake',
    },
    object: {
      module: 'fake module',
    },
    args: {
      module: [
        regularFunction,
        'hello',
        'world',
      ],
    },
  }, inProc);

  t.ok(inProc.testing, 'Should save to target');
  t.ok(tree.testing, 'Should have a testing key');
  t.ok(tree.testing.sub, 'Should have testing.sub');
  t.ok(tree.disabled === null, 'Should have a ghost of disabled value');
  t.strictEquals(tree.testing.sub.id, 1, 'id should match');
  t.strictEquals(tree.top.id, 2, 'id should match');
  t.strictEquals(allObjects.length, 4);
  t.strictEquals(tree.object, 'fake module', 'object should pass as is');
  t.ok(tree.nostart instanceof FakeNoStart, 'object without start should work');
  t.strictEquals(tree.args, 'hello,world', 'array args should work');

  await h20.dehydrate({ foo: true }, allObjects);
  t.strictEquals(stopCount, 2, 'Two modules should have completed stops');
});

tap.test('bad stuff', async (t) => {
  try {
    await h20.hydrate({ foo: true }, {
      badArgs: {
        module: [1, 2, 3],
      },
    });
    t.fail('Bad array arguments should have thrown');
  } catch (error) {
    t.strictEquals(error.message,
      'When using an array for the module parameter, the first element must be a function (badArgs)');
  }

  try {
    await h20.hydrate({ foo: true }, {
      badArgs: [1],
    });
    t.fail('Bad config should have thrown');
  } catch (error) {
    t.strictEquals(error.message, 'Invalid configuration encountered: 1');
  }
});
