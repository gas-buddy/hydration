async function buildObject(context, name, config, tree) {
  if (!config.enabled && 'enabled' in config) {
    return null;
  }
  // Module config. Create the object and call start on it
  if (context.externalContext.logger
    && typeof context.externalContext.logger.info === 'function') {
    context.externalContext.logger.info('Hydrating module', { name });
  }

  if (Array.isArray(config.module)) {
    // A function with arguments
    const [fn, ...args] = config.module;
    if (typeof fn !== 'function') {
      throw new Error(
        `When using an array for the module parameter, the first element must be a function (${name})`,
      );
    }
    return fn(...args);
  }

  // Otherwise, expect a constructor
  const ClassConstructor = config.module.default || config.module;
  if (typeof ClassConstructor === 'function') {
    const obj = new (ClassConstructor)(context.externalContext, config, tree);
    context.allObjects.push(obj);
    // If your object has a start method, call it and wait. Else just take the object
    if (obj.start) {
      // The odd-seeming Promise.resolve/then here is because we can't execute obj.start
      // synchronously. We need all objects to be constructed and put in their position
      // in the object hierarchy BEFORE start is called, because the current API contract
      // is that you can wait on dependencies by resolving their value. In other words, in
      // your start method, you can Promise.resolve(myobject.hydratedThing) and then you
      // will run after that thing has started.
      return Promise.resolve().then(() => obj.start(context.externalContext, tree));
    }
    return obj;
  }
  // Not a function, so just return it.
  return ClassConstructor;
}

function hydrateRecursive(context, name, config, tree, propertyTarget) {
  if (Array.isArray(config)) {
    for (const sub of config) {
      hydrateRecursive(context, name, sub, tree, propertyTarget);
    }
  } else if (typeof config === 'object' && !Array.isArray(config)) {
    for (const [key, subConfig] of Object.entries(config)) {
      if (subConfig.module) {
        const buildResult = buildObject(context, key, subConfig, tree, propertyTarget);
        if (buildResult) {
          // Initialize in parallel by just pushing a promise and fixing the values when done
          const valuePromise = Promise.resolve(buildResult)
            .then((value) => {
              if (context.externalContext.logger
                && typeof context.externalContext.logger.info === 'function') {
                context.externalContext.logger.info('Completed hydration', { key });
              }
              tree[key] = value;
              if (propertyTarget) {
                propertyTarget[key] = value;
              }
              return value;
            });
          // Nobody is done until we are all done
          context.promise = context.promise.then(() => valuePromise);
          tree[key] = valuePromise;
          if (propertyTarget) {
            propertyTarget[key] = valuePromise;
          }
        }
      } else {
        tree[key] = {};
        if (propertyTarget) {
          propertyTarget[key] = {};
        }
        hydrateRecursive(context, key, subConfig, tree[key],
          propertyTarget ? propertyTarget[key] : null);
      }
    }
  } else {
    context.promise = context.promise.then(() => {
      throw new Error(`Invalid configuration encountered: ${JSON.stringify(config, null, '\t')}`);
    });
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
export async function hydrate(externalContext, config, target) {
  const tree = {};
  const allObjects = [];
  const context = {
    allObjects,
    externalContext,
    // Object starts will chain off this promise, giving us
    // something we can wait on for overall completion
    promise: Promise.resolve(),
  };
  hydrateRecursive(context, 'root', config, tree, target);
  await context.promise;
  return { tree, allObjects };
}

export async function dehydrate(externalContext, allObjects) {
  return (allObjects || []).reduce((chain, item) => {
    if (item && typeof item.stop === 'function') {
      return chain.then(() => item.stop(externalContext));
    }
    return chain;
  }, Promise.resolve());
}
