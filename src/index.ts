import snap7, {
  S7Client as NodeS7Client,
  MultiVarRead,
  MultiVarWrite,
  ParamNumber,
  Area,
  WordLen,
} from 'node-snap7';
import EventEmitter from 'events';
import { isIPv4 } from 'net';
import dns from 'dns';
import random from 'lodash.random';
import { Datatypes, S7DbVarType, S7DbVarAreaDbRead, S7FormatterType, S7ParamNumber, S7Area } from './datatypes';

export * from './datatypes';

const debug = (things: string) => console.log('[S7Client]', things);


export type S7ClientOptions = {
    name: string,
    host: string,
    port: number,
    rack: number,
    slot: number,
    connectionCheckInterval: number,
    maxRetryDelay: number,
    alivePkgCycle: number | boolean// send a request every 45x connectionCheck
}

/**
 * High level API for Siemens S7 PLCs
 *
 * Fires: `connect`, `disconnect`, `connect_error`, `value`
 *
 * @emits connect - PLC connected
 * @emits disconnect - PLC disconnected
 * @emits connect_error - Connection error
 * @emits value - Var read
 */
export class S7Client extends EventEmitter {

    client: NodeS7Client;
    opts: S7ClientOptions;
    _retryTimeout: NodeJS.Timeout | null = null;
    _aliveCheckInterval: NodeJS.Timeout | null = null;
  /**
   * Construct a new S7Client
   *
   * @param {Object} options - Options
   * @param {string} [options.name=S7PLC] - Human readable Name for this PLC
   * @param {string} [options.host=localhost] - Hostname or IP
   * @param {int} [options.port=102] - Port
   * @param {int} [options.rack=0] - Rack
   * @param {int} [options.Slot=1] - Slot
   * @param {int} [options.connectionCheckInterval=2000] - Interval in ms to check if PLC is connected
   * @param {int} [options.maxRetryDelay=60000] - Max reconnect delay
   * @param {int} [options.alivePkgCycle=45] - Send a keepAlive package every nth connectionCheck
   */
  constructor(options: Partial<S7ClientOptions>) {
    super(); // init EventEmitter

    // this.client = null;
    this.opts = {
      name: "S7PLC",
      host: "localhost",
      port: 102,
      rack: 0,
      slot: 1,
      connectionCheckInterval: 2000,
      maxRetryDelay: 60 * 1000,
      alivePkgCycle: 45 // send a request every 45x connectionCheck
    };
    Object.assign(this.opts, options || {});

    this.client = new snap7.S7Client();
    this.client.SetParam(S7ParamNumber.RemotePort as unknown as ParamNumber, this.opts.port); // TODO: fix me.
  }

  /**
   * Establish connection to the plc
   *
   * @returns {Promise} resolves with CpuInfo Object
   */
  async connect(): Promise<void> {
    if(this.isConnected()) return Promise.reject(new Error(`Already connected to ${this.opts.name}`));
    // eslint-disable-next-line max-len
    debug(`Connecting to ${this.opts.name} on ${this.opts.host}:${this.opts.port}, Rack=${this.opts.rack} Slot=${this.opts.slot}`);

    return (isIPv4(this.opts.host) ? Promise.resolve(this.opts.host) : S7Client.dnsLookup(this.opts.host))
      .then((ip: string) => new Promise((resolve, reject) => {
        this.client.ConnectTo(ip, this.opts.rack, this.opts.slot, (err) => {
          if(err) {
            err = this.client.ErrorText(err).trim();
            debug(`Connect-Error: ${err}`);
            this.emit('connect_error', err);
            return reject(err);
          }
          this._setupAliveCheck();
          debug(`Connected to ${this.opts.name}`);
        //   resolve(this.getCpuInfo().then(cpuInfo => {
        //     this.emit('connect', cpuInfo);
        //     return cpuInfo
        //   }));
          resolve();
        });
      }));
  }


  /**
   * Establish connection to the plc and keep retrying on error
   *
   * @returns {Promise} resolves with CpuInfo Object
   * @todo Type of the CpuInfo Object Promise
   */
  async autoConnect(): Promise<void | unknown> {
    let retryDelay = this.opts.connectionCheckInterval;

    const _retry = () => {
      debug(`Retry connect to ${this.opts.name}`);
      this.connect().catch(() => {
        retryDelay = Math.round(retryDelay * random(1.3, 1.7, true));
        if(retryDelay > this.opts.maxRetryDelay) retryDelay = this.opts.maxRetryDelay;
        this._retryTimeout = setTimeout(_retry, retryDelay);
      });
    }

    this.on('disconnect', manual => (!manual) && _retry());

    if(this.isConnected()) {
      return await this.getCpuInfo();
    } else {
      try {
        return await this.connect();
      }
      catch(e) {
        setTimeout(_retry, retryDelay);
        throw e;
      }
    }
  }


  /**
   * @private
   */
  _setupAliveCheck(): void {
    let cnt = 1;
    this._aliveCheckInterval && clearInterval(this._aliveCheckInterval);
    this._aliveCheckInterval = setInterval(() => {
      cnt++;

      // send a keep alive request every nth aliveCheck cycle
      if(this.opts.alivePkgCycle !== false && cnt >= this.opts.alivePkgCycle) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
        this.client.PlcStatus((err: Error, res: unknown) => {});
        cnt = 0;
      }

      if(this.isConnected()) return;
      debug(`Alive check: failed`);
      this.emit('disconnect', false);
      this._aliveCheckInterval && clearInterval(this._aliveCheckInterval);
    }, this.opts.connectionCheckInterval);
  }


  /**
   * Disconnect from the PLC
   */
  disconnect(): void {
    this._aliveCheckInterval && clearInterval(this._aliveCheckInterval);
    this._retryTimeout && clearTimeout(this._retryTimeout);
    this.client.Disconnect();
    this.emit('disconnect', true);
  }


  /**
   * Return whether the client is connected or not
   * @returns {boolean}
   */
  isConnected(): boolean {
    return this.client.Connected();
  }


  /**
   * Return DateTime from PLC
   * @returns {Promise}
   * @todo Type of the Promise
   */
  getPlcDateTime(): Promise<unknown> {
    return this._cbToPromise(this.client.GetPlcDateTime.bind(this.client));
  }


  /**
   * Return getCpuInfo from PLC
   * @returns {Promise}
   * @todo Type of the Promise
   */
  async getCpuInfo(): Promise<unknown> {
    return this._cbToPromise(this.client.GetCpuInfo.bind(this.client));
  }

  /**
   * Read a DB and parse the result
   * @param {int} DBNr - The DB Number to read
   * @param {array} vars - Array of Var objects
   * @param {int} vars[].start - Position of the first byte
   * @param {int} [vars[].bit] - Position of the bit in the byte
   * @param {Datatype} vars[].type - Data type (BYTE, WORD, INT, etc), see {@link /s7client/?api=Datatypes|Datatypes}
   * @returns {Promise} - Resolves to the vars array with populate *value* property
   */
  async readDB(DBNr: number, vars: S7DbVarAreaDbRead[]): Promise<S7DbVarAreaDbRead[]> {
    return new Promise((resolve, reject) => {
      if(vars.length === 0) return resolve([]);

      let end = 0;
      let offset = Number.MAX_SAFE_INTEGER;
      vars.forEach(v => {
        if(v.start < offset) offset = v.start;
        if(end < v.start + Datatypes[v.type].bytes) {
          end = v.start + Datatypes[v.type].bytes;
        }
      });
      debug(`${this.opts.name}: ReadDB DB=${DBNr}, Offset=${offset}, Length=${end - offset}`);
      this.client.DBRead(DBNr, offset, end - offset, (err, res) => {
        if(err) return reject(this._getErr(err));
        resolve(vars.map(v => {
          v.value = Datatypes[v.type].parser(res, v.start - offset, v.bit);
          this.emit('value', v);
          return v;
        }));
      });
    });
  }

  /**
   * Read multiple Vars and parse the result
   * @param {array} vars - Array of Var objects
   * @param {int} vars[].start - Position of the first byte
   * @param {int} [vars[].bit] - Position of the bit in the byte
   * @param {Datatype} vars[].type - Data type (BYTE, WORD, INT, etc), see {@link /s7client/?api=Datatypes|Datatypes}
   * @param {string} vars[].area - Area (pe, pa, mk, db, ct, tm)
   * @param {int} [vars[].dbnr] - DB Nr if read from area=db
   * @returns {Promise} - Resolves to the vars array with populate *value* property
   */
  async readVars(vars: S7DbVarType[]) : Promise<Array<S7DbVarType>>  {
    return new Promise((resolve, reject) => {
      debug(`${this.opts.name}: ReadMultiVars: ${JSON.stringify(vars)}`);
      const toRead: MultiVarRead[] = vars.map(v => {
        const areaKey: keyof typeof S7Area  = 'S7Area' + v.area.toUpperCase() as keyof typeof S7Area;
        return {
          Area: S7Area[areaKey] as Area,
          WordLen: Datatypes[v.type].S7WordLen as unknown as WordLen,
          DBNumber: v.dbnr,
          Start: v.type === 'BOOL' ? v.start * 8 + (v.bit as number) : v.start,
          Amount: 1
        }
      });

      this.client.ReadMultiVars(toRead, (err, res) => {
        if(err) return reject(this._getErr(err));
        const errs: number[] = [];
        const results = vars.map((v, i) => {
          if(res[i].Result !== 0) { errs.push(res[i].Result); return }
          v.value = Datatypes[v.type].parser(res[i].Data);
          this.emit('value', v);
          return v;
        });
        if(errs.length) return reject(this._getErr(errs));
        resolve(results as S7DbVarType[]);
      });
    });
  }

  /**
   * Write multiple Vars
   * @param {array} vars - Array of Var objects
   * @param {int} vars[].start - Position of the first byte
   * @param {int} [vars[].bit] - Position of the bit in the byte
   * @param {Datatype} vars[].type - Data type (BYTE, WORD, INT, etc), see {@link /s7client/?api=Datatypes|Datatypes}
   * @param {string} vars[].area - Area (pe, pa, mk, db, ct, tm)
   * @param {string} [vars[].dbnr] - DB Nr if read from area=db
   * @param vars[].value - Value
   * @returns {Promise} - Resolves to the vars array with populate *value* property
   */
  async writeVars(vars: S7DbVarType[]): Promise<S7DbVarType[]> {
    debug(`${this.opts.name}: WriteMultiVars: ${JSON.stringify(vars)}`);
    const toWrite: MultiVarWrite[]= vars.map(v => {
        const areaKey: keyof typeof S7Area  = 'S7Area' + v.area.toUpperCase() as keyof typeof S7Area;
        return ({
        Area: S7Area[areaKey] as Area,
        WordLen: Datatypes[v.type].S7WordLen as unknown as WordLen,
        DBNumber: v.dbnr,
        Start: v.type === 'BOOL' ? v.start * 8 + (v.bit as number) : v.start,
        Amount: 1,
        Data: (Datatypes[v.type].formatter as S7FormatterType)(v.value as boolean | number | string) // TODO fix me
        })
    });

    return new Promise((resolve, reject) => {
      this.client.WriteMultiVars(toWrite, (err, res) => {
        if(err) return reject(this._getErr(err));
        const errs: number[] = [];

        const results = vars.map((v, i) => {
          if(res[i].Result !== 0) {errs.push(res[i].Result); return }
          return v;
        });
        if(errs.length) return reject(this._getErr(errs));
        resolve(results as S7DbVarType[]);
      });
    });
  }


  /**
   * Read a single var
   * @param {string} v.area - Area (pe, pa, mk, db, ct, tm)
   * @param {Datatype} v.type - Data type (BYTE, WORD, INT, etc), see {@link /s7client/?api=Datatypes|Datatypes}
   * @param {int} v.start - Position of the first byte
   * @param {string} [v.dbnr] - DB Nr if read from area=db
   * @param {int} [v.bit] - Position of the bit in the byte
   * @returns {Promise} - Resolves to the var obj with populate *value* property
   */
  async readVar(v: S7DbVarType): Promise<S7DbVarType> {
    if(v.area === 'db' && !v.dbnr) throw new Error(`Param dbnr is mandatory for area=db`);
    return this.readVars([v])
      .then(r => r[0]);
  }


  /**
   * Write a single var
   * @param {string} v.area - Area (pe, pa, mk, db, ct, tm)
   * @param {Datatype} v.type - Data type (BYTE, WORD, INT, etc), see {@link /s7client/?api=Datatypes|Datatypes}
   * @param {int} v.start - Position of the first byte
   * @param {string} [v.dbnr] - DB Nr if read from area=db
   * @param {int} [v.bit] - Position of the bit in the byte
   * @param v.value - Value to write
   * @return {Promise<*>}
   */
  async writeVar(v: S7DbVarType): Promise<S7DbVarType> {
    return this.writeVars([v]).then(erg => erg[0]);
  }


  /**
   * Construct Error object
   *
   * @private
   */
  _getErr(s7err: number | number[]): Error {
    if(Array.isArray(s7err)) return new Error(`${this.opts.name} Errors: ` + s7err.join('; '));
    return new Error(`${this.opts.name}: ` + this.client.ErrorText(s7err));
  }

  /**
   * Callback to promise
   *
   * @private
   */
  async _cbToPromise<T>(fn: (cb: (err: number, data: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      fn((err, data) => {
        if(err) return reject(this._getErr(err));
        resolve(data);
      });
    });
  }

  /**
   * Get IP address from hostname
   *
   * @private
   */
  static dnsLookup(host:string): Promise<string> {
    return new Promise((resolve, reject) => {
      dns.lookup(host, 4, function(err, ip) {
        if(err) {
          debug(`Error resolving IP for Host ${host}`);
          return reject(err);
        }
        debug(`Resolved Host ${host} to IP ${ip}`);
        resolve(ip);
      });
    });
  }

}
