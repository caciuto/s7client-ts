import { S7Client, S7DbVarAreaDbRead } from '../src';

// PLC Connection Settings
const plcSettings = {
  name: "TEST MASTER",
  host: '10.2.1.66',
  port: 102,
  rack: 0,
  slot: 1
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
  const res = await client.readDB(dbNr, dbVars);
  console.log(res);

  // Write multiple Vars
  // goMaintenance
  // await client.writeVars([
  //   {
  //     area: 'db', dbnr: 100, type: 'INT',
  //     start: 2,
  //     value: 11
  //   }, {
  //     area: 'db', dbnr: 100, type: 'INT',
  //     start: 4,
  //     value: 2
  //   }, {
  //     area: 'db', dbnr: 100, type: 'BOOL',
  //     start: 0, bit: 0,
  //     value: true
  //   }
  // ]);

  // goHome
  // await client.writeVars([
  //   {
  //     area: 'db', dbnr: 100, type: 'INT',
  //     start: 2,
  //     value: 10
  //   }, {
  //     area: 'db', dbnr: 100, type: 'INT',
  //     start: 4,
  //     value: 1
  //   }, {
  //     area: 'db', dbnr: 100, type: 'BOOL',
  //     start: 0, bit: 0,
  //     value: true
  //   }
  // ]);

  client.disconnect();
})();