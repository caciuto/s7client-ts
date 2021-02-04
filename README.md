# S7Client-ts

Typescript port of [S7Client](https://github.com/psi-4ward/s7client), the Hi-Level API for [node-snap7](https://github.com/mathiask88/node-snap7) to communicate with Siemens S7 PCLs (See [compatibility](http://snap7.sourceforge.net/snap7_client.html#target_compatibility)).

* Typescript
* Promise based, `async/await` support
* Returns javascript objects with parsed var objects
* EventEmitter: (`connect`, `disconnect`, `connect_error`, `value`)
* Optional auto reconnect


## Api Documentation
// TODO

## Usage

```sh
npm install s7client-ts
```

```ts
import { S7Client, S7DbVarAreaDbRead } from 's7client-ts';

// PLC Connection Settings
const plcSettings = {
  name: "LocalPLC",
  host: 'localhost',
  port: 9102,
  rack: 0,
  slot: 2
};


// DBA to read
const dbNr = 102;
const dbVars: S7DbVarAreaDbRead[] = [
  // { type: "CHAR", start: 0 },
  { type: "BOOL", start: 4, bit: 2 },
  { type: 'INT', start: 13 }
];

const client = new S7Client(plcSettings);
client.on('error', console.error);

(async function () {
  console.log("connectind");
  await client.connect().catch((e) => console.log(e));
  console.log("connected", client.isConnected());

  // Read DB
  const res: S7DbVarAreaDbRead[] = await client.readDB(dbNr, dbVars);
  console.log(res);

  // Write multiple Vars
  await client.writeVars([{
    area: 'db', dbnr: 1, type: 'BOOL',
    start: 5, bit: 2,
    value: true
  }]);

  client.disconnect();
})();
```


## Special thanks to
- Davide Nardella for creating [snap7](http://snap7.sourceforge.net)
- Mathias Küsel for creating [node-snap7](https://github.com/mathiask88/node-snap7)
- Christoph Wiechert for creating [s7client](https://github.com/psi-4ward/s7client)


## License & copyright
* [S7Client-ts](https://github.com/caciuto/s7client-ts/blob/master/LICENSE): MIT
* [S7Client](https://github.com/psi-4ward/s7client/blob/master/LICENSE): MIT
* [node-snap7](https://github.com/mathiask88/node-snap7/blob/master/LICENSE): MIT
* [snap7](http://snap7.sourceforge.net/licensing.html): LGPLv3
