// copied from node-snap7 type declarations.
export const enum S7ParamNumber  {
  RemotePort = 2,
  PingTimeout = 3,
  SendTimeout = 4,
  RecvTimeout = 5,
  SrcRef = 7,
  DstRef = 8,
  SrcTSap = 9,
  PDURequest = 10
}

export const S7Area = {
  S7AreaPE: 0x81,
  S7AreaPA: 0x82,
  S7AreaMK: 0x83,
  S7AreaDB: 0x84,
  S7AreaCT: 0x1C,
  S7AreaTM: 0x1D
}

export const enum S7WordLen {
  S7WLBit = 0x01,
  S7WLByte = 0x02,
  S7WLWord = 0x04,
  S7WLDWord = 0x06,
  S7WLReal = 0x08,
  S7WLCounter = 0x1C,
  S7WLTimer = 0x1D
}

// export type S7DbVarBool = {
//   type: 'BOOL';
//   start: number;
//   bit: number;
//   value?: boolean;
// }

// export type S7DbVarBoolWrite = S7DbVarBool & {
//   area: 'pe' | 'pa' | 'mk' | 'db' | 'ct' | 'tm';
//   dbnr: number;
//   value: boolean;
// };

// export type S7DbVar = S7DbVarBool & {
//   type: //'BOOL' |
//       'BYTE' |
//       'WORD' |
//       'DWORD' |
//       'CHAR' |
//       'INT' |
//       'DINT' |
//       'REAL';
//   dbnr?: number;
//   area?: 'pe' | 'pa' | 'mk' | 'db' | 'ct' | 'tm';
//   start: number;
//   value: number | string;
// }

// export type S7DbVarWrite = S7DbVarBoolWrite | (S7DbVar & {
//   area: 'pe' | 'pa' | 'mk' | 'db' | 'ct' | 'tm';
//   dbnr: number;
//   value: number | string;
// })

export type S7DbVarAreaDbRead = {
  type: 'BOOL' |
        'BYTE' |
        'WORD' |
        'DWORD' |
        'CHAR' |
        'INT' |
        'DINT' |
        'REAL';
    start: number;
    bit?: number;
    value?: boolean | number | string;
}

export type S7DbVarType = {
    type: 'BOOL' |
        'BYTE' |
        'WORD' |
        'DWORD' |
        'CHAR' |
        'INT' |
        'DINT' |
        'REAL';
    dbnr: number;
    area: 'pe' | 'pa' | 'mk' | 'db' | 'ct' | 'tm';
    start: number;
    bit?: number;
    value?: boolean | number | string;
}

export type S7ParserType = (
    buffer: Buffer,
    offset?: number,
    bit?: number
) => boolean | number | string

export type S7FormatterType = (value: boolean | number | string) => Buffer

export type S7ClientDatatype = {
    bytes: number,
    parser: S7ParserType,
    formatter: S7FormatterType,
    S7WordLen: S7WordLen,
};

type BufferReadFnName = 
    'readUInt8' |
    'readUInt16BE' |
    'readUInt32BE' |
    'readInt16BE' |
    'readInt32BE' | 
    'readFloatBE';

type BufferWriteFnName = 
    'writeUInt8' |
    'writeUInt16BE' |
    'writeUInt32BE' |
    'writeInt16BE' |
    'writeInt32BE' | 
    'writeFloatBE';

/**
 * S7Client Datatype
 *
 * @typedef {object} S7ClientDatatype
 * @property {number} bytes - Number of bytes
 * @property {function} parser - Convert Buffer to {bool|number|string}
 * @property {function} formatter - Convert {bool|number|string} to Buffer
 * @property {number} S7WordLen - S7WL type
 */

// const a = 'readUInt8';
function _gen(
    bytes: number, 
    bFn: string,
    S7WordLen: S7WordLen
): S7ClientDatatype {
  return {
    bytes,
    parser: (buffer, offset = 0) => {
        const fnName: BufferReadFnName = 'read'+bFn as BufferReadFnName;
        return buffer[fnName](offset);
    }, //  buffer[`bfn`](offset),
    formatter: (v) => {
        const b = Buffer.alloc(bytes);
        const fnName: BufferWriteFnName = 'write'+bFn as BufferWriteFnName
        b[fnName](v as number);
      return b;
    },
    S7WordLen
  }
}

/**
 * @enum
 */
export const Datatypes = {
  /**
   * BOOL
   * @type {S7ClientDatatype}
   */
  BOOL: {
    bytes: 1,
    parser: (buffer: Buffer, offset = 0, bit = 0) : boolean => (+buffer.readUInt8(offset) >> bit & 1 )=== 1,
    formatter: (v: boolean): Buffer => Buffer.from([v ? 0x01 : 0x00]),
    S7WordLen: S7WordLen.S7WLBit
  },

  /**
   * BYTE
   * @type {S7ClientDatatype}
   */
  BYTE: _gen(1, 'UInt8', S7WordLen.S7WLByte),

  /**
   * WORD
   * @type {S7ClientDatatype}
   */
  WORD: _gen(2, 'UInt16BE', S7WordLen.S7WLWord),

  /**
   * DWORD
   * @type {S7ClientDatatype}
   */
  DWORD: _gen(4, 'UInt32BE', S7WordLen.S7WLDWord),

  /**
   * CHAR
   * @type {S7ClientDatatype}
   */
  CHAR: {
    bytes: 1,
    parser: (buffer: Buffer, offset = 0): string => buffer.toString('ascii', offset, offset + 1),
    formatter: (v: string): Buffer => Buffer.from(v, 'ascii'),
    S7WordLen: S7WordLen.S7WLByte
  },

  /**
   * INT
   * @type {S7ClientDatatype}
   */
  INT: _gen(2, 'Int16BE', S7WordLen.S7WLWord),

  /**
   * DINT
   * @type {S7ClientDatatype}
   */
  DINT: _gen(4, 'Int32BE', S7WordLen.S7WLDWord),

  /**
   * REAL
   * @type {S7ClientDatatype}
   */
  REAL: _gen(4, 'FloatBE', S7WordLen.S7WLReal),
};
