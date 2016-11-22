hydration
=========

This module allows runtime object creation from configuration files. It is a part of our
microservices framework. Whereas express-participating things have [meddleware](https://github.com/gas-buddy/meddleware)
which will instantiate and wire up handlers into express. hydration is an analog to that for things that are
NOT handlers, like database connections, third party service connections, or "global" resources like logstash.

The only thing non-obvious it does is deal with promises - such that all setup is complete before the root hydrate
promise is resolved - and mirror the configuration structure in the resultant object. In other words, a config like this:

```
{
  testing: {
    sub: {
      module: "require:./some_module"
    }
  },
  top: {
    module: "require:./other_module"
  },
  disabled: {
    enabled: false,
    module: 'totallyFake'
  }
}
```

Will result in a runtime object that looks like:

```
{
  testing: {
    sub: (the result of calling await start() on an instance of the class exported by some_module)
  },
  top: (the result of calling await start() on an instance of the class exported by other_module),
  disabled: null
}
```
