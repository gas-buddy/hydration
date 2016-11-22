import tap from 'tap';
import assert from 'assert';
import bluebird from 'bluebird';
import * as h20 from '../src/index';

global.Promise = bluebird;

let finishedOne;
let stopCount = 0;

class FakeHydro {
  constructor(context, config) {
    assert(context.foo, 'Should get context');
    assert(config.which, 'Should have a "which" property');
    this.which = config.which;
  }

  async start(context) {
    assert(!finishedOne, 'Should start in parallel');
    assert(context.foo, 'Should get context');
    await Promise.delay(10);
    return { id: this.which };
  }

  async stop(context) {
    assert(context.foo, 'Should get context');
    assert(this.which, 'Should have a "which" property');
    await Promise.delay(10);
    stopCount += 1;
  }
}

tap.test('should hydrate and dehydrate', async (t) => {
  const { allObjects, tree } = await h20.hydrate({ foo: true }, {
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
    disabled: {
      enabled: false,
      module: 'totallyFake',
    },
  });
  t.ok(tree.testing, 'Should have a testing key');
  t.ok(tree.testing.sub, 'Should have testing.sub');
  t.ok(tree.disabled === null, 'Should have a ghost of disabled value');
  t.strictEquals(tree.testing.sub.id, 1, 'id should match');
  t.strictEquals(tree.top.id, 2, 'id should match');
  t.strictEquals(allObjects.length, 2);

  await h20.dehydrate({ foo: true }, allObjects);
  t.strictEquals(stopCount, 2, 'Two modules should have completed stops');
});
