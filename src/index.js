async function buildObject(context, name, config) {
  if (!config.enabled && 'enabled' in config) {
    return null;
  }
  // Module config. Create the object and call start on it
  if (context.externalContext.logger &&
    typeof context.externalContext.logger.info === 'function') {
    context.externalContext.logger.info('Hydrating module', { name });
  }
  const ClassConstructor = config.module.default || config.module;
  const obj = new (ClassConstructor)(context.externalContext, config);
  context.allObjects.push(obj);
  return await obj.start(context.externalContext);
}

async function hydrateRecursive(context, name, config, tree) {
  if (Array.isArray(config)) {
    for (const sub of config) {
      hydrateRecursive(context, name, sub, tree);
    }
  } else if (typeof config === 'object' && !Array.isArray(config)) {
    for (const [key, subConfig] of Object.entries(config)) {
      if (subConfig.module) {
        const buildResult = buildObject(context, key, subConfig);
        if (buildResult) {
          // Initialize in parallel by just pushing a promise and fixing the values when done
          const valuePromise = Promise.resolve(buildResult)
            .then((value) => {
              if (context.externalContext.logger &&
                typeof context.externalContext.logger.info === 'function') {
                context.externalContext.logger.info('Completed hydration', { key });
              }
              tree[key] = value;
            });
          // Nobody is done until we are all done
          context.promise = context.promise.then(() => valuePromise);
        }
      } else {
        tree[key] = {};
        hydrateRecursive(context, key, subConfig, tree[key]);
      }
    }
  } else {
    throw new Error(`Invalid configuration encountered: ${JSON.stringify(config, null, '\t')}`);
  }
}

/**
 * Build a set of objects from configuration, including
 * start/stop handling. Returns an object with
 * an "allObjects" property and a "tree" property.
 * allObjects is just an array of everything that was hydrated,
 * tree reflects the structure found in config and the result of
 * calling the "start" method on the objects. Which means that
 * allObjects contains all the modules you specified, and
 * tree contains whatever those modules returned when start was called.
 *
 * (This is done because some of the modules basically just orchestrate
 * creation of other things, but they need to handle teardown rather
 * than each of their generated objects)
 */
export async function hydrate(externalContext, config) {
  const tree = {};
  const allObjects = [];
  const context = {
    allObjects,
    externalContext,
    promise: Promise.resolve(),
  };
  hydrateRecursive(context, 'root', config, tree);
  await context.promise;
  return { tree, allObjects };
}

export async function dehydrate(externalContext, allObjects) {
  for (const o of allObjects) {
    if (o && typeof o.stop === 'function') {
      await o.stop(externalContext);
    }
  }
}
