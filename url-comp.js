/*
"url-comp.js"
URLCompressor library Version 0.1.0

Copyright (c) 2021 Hiroshi Tanigawa
http://synapse.kyoto/

This program is distributed under MIT licence.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const URLCompressor=(()=>{

  // refer https://qiita.com/weal/items/10122402adb61597f851

  function getScalarArray(str)
  {
    if(typeof str!=="string") {
      return null;
    } // if
    const scalarArray=[];
    for(let len=str.length,i=0; i<len; i++) {
      const c=str.charCodeAt(i);
      if(c>=0xd800 && c<=0xdbff) { // 前半サロゲートだった
        if(i+1>=len) { // 後半サロゲートがなかった
          return null;
        } // if
        scalarArray.push((c & 0x3ff)+0x40<<10 | str.charCodeAt(++i) & 0x3ff);
      } else {
        scalarArray.push(c);
      } // if
    } // for i
    return scalarArray;
  } // getScalarArray

  function encodeUtf8(str)
  {
    const scalarArray=getScalarArray(str);
    if(scalarArray===null) {
      return null;
    } // if
    let utf8str='';
    for(let len=scalarArray.length,i=0; i<len; i++) {
      const c=scalarArray[i];
      if(c<=0x7f) { // 1 byte
        utf8str+=String.fromCharCode(c);
      } else if(c<=0x7ff) { // 2 bytes
        utf8str+=String.fromCharCode(0xc0 | (c>>>6), 0x80 | c & 0xbf);
      } else if(c<=0xffff) { // 3 bytes
        utf8str+=String.fromCharCode(0xe0 | (c>>>12), 0x80 | (c>>>6) & 0xbf, 0x80 | c & 0xbf);
      } else if(c<=0x10ffff) { // 4 bytes
        utf8str+=String.fromCharCode(0xf0 | (c>>>18), 0x80 | (c>>>12) & 0xbf, 0x80 | (c>>>6) & 0xbf, 0x80 | c & 0xbf);
      } else { // 5バイト以上だった
        return null;
      } // if
    } // for
    return utf8str;
  } // encodeUtf8

  function decodeUtf8(str)
  {
    if(typeof str!=="string") {
      return null;
    } // if
    let utf16str='';
    for(let i=0,len=str.length; i<len; i++) {
      const c0=str.charCodeAt(i);
      if(c0<=0x7f) { // 1 byte
        utf16str+=String.fromCharCode(c0);
      } else if(c0>=0xc2 && c0<=0xdf) { // 2 bytes
        if(i+1>=len) {
          return null;
        } // if
        const c1=str.charCodeAt(++i);
        utf16str+=String.fromCharCode((c0 & 0x1f)<<6|(c1 & 0x3f));
      } else if(c0>=0xe0 && c0<=0xef) { // 3 bytes
        if(i+2>=len) {
          return null;
        } // if
        const c1=str.charCodeAt(++i);
        const c2=str.charCodeAt(++i);
        utf16str+=String.fromCharCode((c0 & 0xf)<<12|(c1 & 0x3f)<<6|(c2 & 0x3f));
      } else if(c0>=0xf0 && c0<=0xf4) { // 4 bytes
        if(i+3>=len) {
          return null;
        } // if
        const c1=str.charCodeAt(++i);
        const c2=str.charCodeAt(++i);
        const c3=str.charCodeAt(++i);
        utf16str+=String.fromCharCode(
          0xd800 | (((c0 & 0x7)<<8 | (c1 & 0x3f)<<2 | c2>>>4 & 0x3) - 0x40),
          0xdc00 | (c2 & 0xf)<<6 | c3 & 0x3f
        );
      } else { // 不正なUTF8コード
        return null;
      } // if
    } // for i
    return utf16str;
  } // decodeUtf8

  const symbolNum=[258,258,130,99];
  const DIC=[256,256,128,97];
  const EOF=[257,257,129,98];
  const dictionarySize=2048;
  const totalOffset=0.25;
  const matchLimit=1000;

  const mode3EncodeTable=(()=>
  {
    const result=[];
    let cnt=0;
    for(i=0; i<0x80; i++) {
      if(i<0x20 && i!==0x09 && i!==0x0a || i===0x7f) {
        result.push(null);
      } else {
        result.push(cnt++);
      }
    } // for i
    return result;
  })();

  const mode3DecodeTable=(()=>
  {
    const result=[];
    for(i=0; i<mode3EncodeTable.length; i++) {
      if(mode3EncodeTable[i]!==null) {
        result.push(i);
      } // if
    } // for i
    return result;
  })(); // mode3DecodeTable

  const base64UrlTable='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  const base64UrlReverseTable=(()=>
  {
    const result=new Map();
    for(let len=base64UrlTable.length,i=0; i<len; i++) {
      result.set(base64UrlTable[i],i);
    } // for i
    return result;
  })(); // base64UrlReverseTable

  function getRequiredBits(n)
  {
    let m=1;
    let bits=0;
    while(n>=m) {
      m<<=1;
      bits++;
    } // while
    return bits;
  } // getRequiredBits

  function getHuffmanTree(array,symbolNum)
  {
    // シンボルをソートする
    const symbolSortTable=[];
    for(let i=0; i<symbolNum; i++) {
      symbolSortTable.push(null);
      let j=i;
      while(j>0 && symbolSortTable[j-1].count<array[i]) {
        symbolSortTable[j]=symbolSortTable[j-1];
        j--;
      } // while
      symbolSortTable[j]={count:array[i],symbol:i,left:null,right:null};
    } // for i

    // ハフマン木を作成する
    while(symbolSortTable.length>1) {
      const newObj={
        count:symbolSortTable[symbolSortTable.length-2].count+symbolSortTable[symbolSortTable.length-1].count,
        symbol:-1,
        left:symbolSortTable[symbolSortTable.length-2],
        right:symbolSortTable[symbolSortTable.length-1]
      };
      symbolSortTable.pop();
      let i=symbolSortTable.length-1;
      while(i>0 && symbolSortTable[i-1].count<newObj.count) {
        symbolSortTable[i]=symbolSortTable[i-1];
        i--;
      } // while
      symbolSortTable[i]=newObj;
    } // while
    return symbolSortTable[0];
  } // getHuffmanTree

  function getCodeTable(tree,symbolNum)
  {
    const codeTable=[];
    for(let i=0; i<symbolNum; i++) {
      codeTable.push(null);
    } // for i
    const codeBuf={buf:new Uint8Array((symbolNum+7)>>>3),bitNum:0};
    const seekCode=(treeNode) => {
      if(treeNode.symbol>=0) { // シンボルに到達した
        const bitNum=codeBuf.bitNum;
        const byteNum=(bitNum+7)>>>3;
        const code=new Uint8Array(byteNum);
        for(let i=0; i<byteNum; i++) {
          code[i]=codeBuf.buf[i];
        } // for i
        codeTable[treeNode.symbol]={code:code,bitNum:bitNum};
      } else { // 子ノードを探索
        // 左の探索
        const bitNum=codeBuf.bitNum;
        codeBuf.buf[bitNum>>>3]&=~(1<<(7-bitNum%8));
        codeBuf.bitNum++;
        seekCode(treeNode.left);

        // 右の探索
        codeBuf.buf[bitNum>>>3]|=1<<(7-bitNum%8);
        seekCode(treeNode.right);
        codeBuf.bitNum--;
      } // if
    }; // seekCode
    seekCode(tree);
    return codeTable;
  } // getCodeTable

  function compress(str,encode64=true)
  {
    let resultStr='';
    let byteBuf=0;
    let bitNum=0;
    const codeBits=encode64 ? 6 : 8;

    // モードを返す
    // MODE 0:strに256以上の文字コードが含まれていた
    // MODE 1:strが255以下だけの文字コードで、128以上の文字コードが含まれていた
    // MODE 2:strが127以下だけの文字コードだった
    // MODE 3:strが127以下だけの文字コードで、0x00～0x08、0x0b～0x1f、0x7fを含まなかった
    const getMode=(str) =>
    {
      const count=[];
      for(let i=0; i<256; i++) {
        count.push(0);
      } // for i

      for(let len=str.length,i=0; i<len; i++) {
        if(str.charCodeAt(i)>=256) {
          return 0;
        } // if
        count[str.charCodeAt(i)]++;
      } // for i

      for(let i=128; i<256; i++) {
        if(count[i]>0) {
          return 1;
        } // if
      } // for i

      for(let len=mode3EncodeTable.length,i=0; i<=len; i++) {
        if(mode3EncodeTable[i]===null && count[i]>0) {
          return 2;
        } // if
      } // for i
      return 3;
    } // getMode

    const encodeInt=(intNum) => {
      const buf=[3];
      let i=intNum;
      while(i!==0) {
        i--;
        buf.push(i % 3);
        i=Math.floor(i/3);
      } // while
      const codeBuf=new Uint8Array((buf.length*2+6)>>>3);
      let bitCnt=0;
      let byte=0;
      for(let i=buf.length-1; i>=0; i--) {
        byte=(byte<<2)+buf[i];
        bitCnt+=2;
        if(bitCnt%8==0) {
          codeBuf[(bitCnt>>>3)-1]=byte;
          byte=0;
        } // if
      } // for i
      if(bitCnt%8!==0) {
        const rem=8-bitCnt%8;
        codeBuf[bitCnt>>>3]=byte<<rem;
      } // if
      return {codeBuf:codeBuf,bitCnt:bitCnt};
    }; // encodeInt

    const outputData=(codeBuf,bitCnt) => {
      let bitPos=0;
      let bytePos=0;
      let remBits=bitCnt;
      while(remBits>0) {
        byteBuf=(byteBuf<<1)+(codeBuf[bytePos]>>(7-bitPos)&1);
        if(++bitNum===codeBits) {
          resultStr+=encode64 ? base64UrlTable[byteBuf] : String.fromCharCode(byteBuf);
          byteBuf=0;
          bitNum=0;
        } // if
        if(++bitPos==8) {
          bitPos=0;
          bytePos++;
        } // if
        remBits--;
      } // while
    }; // outputData

    const outputMode=(mode) =>
    {
      const tempArray=new Uint8Array(1);
      tempArray[0]=mode<<6;
      outputData(tempArray,2);
    } // outputMode

    // body of compress
    if(typeof str!=="string") {
      return null;
    } // if

    const mode=getMode(str); // モードの取得
    const _symbolNum=symbolNum[mode]; // シンボル数の取得
    const _DIC=DIC[mode]; // スライド辞書用シンボルの取得
    const _EOF=EOF[mode]; // データ終端用シンボルの取得

    let strToCompress;
    if(mode===0) { // モード0なら、UTF8にエンコード
      strToCompress=encodeUtf8(str);
      if(strToCompress===null) {
        return null; // UTF8のエンコードに失敗した
      } // if
    } else if(mode===3) { // モード3なら97文字に圧縮
      const encodeTable=mode3EncodeTable;
      strToCompress='';
      for(let len=str.length,i=0; i<len; i++) {
        strToCompress+=String.fromCharCode(encodeTable[str.charCodeAt(i)]);
      } // for i
    } else {
      strToCompress=str;
    } // if

    // symbolTotalTableの初期化
    let symbolTotalTable=[];
    for(let i=0; i<_symbolNum; i++) {
      symbolTotalTable.push(totalOffset);
    } // for i

    // モードの書き出し
    outputMode(mode);

    // スライド辞書関係の初期化
    const lastIndex=[];
    for(let i=0; i<256; i++) {
      lastIndex.push(null);
    } // i
    const prevIndex=[];

    // メインループ
    let tree;
    let codeTable;
    let i=0;
    let symbolCnt=0;
    let len=strToCompress.length;
    while(true) {
      if(symbolCnt<256 || symbolCnt%8===0) {
        tree=getHuffmanTree(symbolTotalTable,_symbolNum);
        codeTable=getCodeTable(tree,_symbolNum);
      } // if
      if(i>=len) {
        break;
      } // if
      let code=strToCompress.charCodeAt(i);
      let maxMatch=0;
      let matchIndex=0;
      if(i>0) { // スライド辞書検索
        let index=lastIndex[code];
        while(index!==null && i-index<=dictionarySize) {
          let match=1;
          while(i+match-1<strToCompress.length && strToCompress[i+match]===strToCompress[index+match]) {
            match++;
            if(match>=matchLimit) {
              break;
            } // if
          } // while
          if(match>maxMatch) {
            maxMatch=match;
            matchIndex=index;
            if(maxMatch>=matchLimit) {
              break;
            } // if
          } // if
          index=prevIndex[index];
        } // while
      } // if
      if(maxMatch>=3) {
        code=_DIC;
      } // if
      outputData(codeTable[code].code,codeTable[code].bitNum);
      let step=1;
      if(code===_DIC) { // スライド辞書がヒットした
        const encResult=encodeInt(maxMatch-3);
        outputData(encResult.codeBuf,encResult.bitCnt);
        const offset=i-matchIndex-1;
        const bits=getRequiredBits(Math.min(i-1,dictionarySize-1));
        const offsetArray=new Uint8Array(2);
        if(bits<=8) {
          offsetArray[0]=offset<<(8-bits);
        } else {
          offsetArray[0]=offset>>(bits-8);
          offsetArray[1]=(offset<<(16-bits)) & 0xff;
        } // if
        outputData(offsetArray,bits);
        step=maxMatch;
      } // if
      for(let j=0; j<step; j++) {
        prevIndex.push(lastIndex[strToCompress.charCodeAt(i)]);
        lastIndex[strToCompress.charCodeAt(i)]=i;
        i++;
      } // for j
      symbolCnt++;
      symbolTotalTable[code]++;
    } // while

    if(bitNum>0) { // 未出力のコードが残っていた時の処理
      byteBuf=(byteBuf<<(codeBits-bitNum))+(codeTable[_EOF].code[0]>>(bitNum+8-codeBits));
      resultStr+=encode64 ? base64UrlTable[byteBuf] : String.fromCharCode(byteBuf);
    } // if

    return resultStr;
  } // compress

  function expand(str,decode64=true)
  {
    let bytePos;
    let bitPos;
    let code;
    const codeBuf=new Uint8Array(str.length);
    const codeBits=decode64 ? 6 : 8;

    const readBit=() => {
      const bit=(code>>(codeBits-bitPos-1)) & 1;
      if(++bitPos===codeBits) {
        bitPos=0;
        bytePos++;
        if(bytePos<len) {
          code=codeBuf[bytePos];
        } // if
      } // if
      return bit;
    } // readBit

    const decodeInt=() => {
      let w=0;
      let decodedNum=0;
      do {
        if(bytePos>=codeBuf.length) {
          return -1;
        } // if
        w=readBit();
        if(bytePos>=codeBuf.length) {
          return -1;
        } // if
        w=(w<<1)+readBit();
        if(w<3) {
          decodedNum=decodedNum*3+w+1;
        } // if
      } while(w<3);
      return decodedNum;
    }; // decodeInt

    const getMode=() =>
    {
      let mode=readBit();
      mode=(mode<<1)+readBit();
      return mode;
    } // getMode

    // body of decode
    if(typeof str!=="string" || str.length===0) {
      return null;
    } // if

    for(let len=str.length,i=0; i<len; i++) {
      let code;
      if(decode64) {
        code=base64UrlReverseTable.get(str[i]);
        if(code===undefined) {
          return null;
        } // if
      } else {
        code=str.charCodeAt(i);
        if(code>=0x100) {
          return null;
        } // if
      } // if
      codeBuf[i]=code;
    } // for i

    bytePos=0;
    bitPos=0;
    code=codeBuf[0];

    const mode=getMode(); // modeの取得
    const _symbolNum=symbolNum[mode]; // シンボルの種類の取得
    const _DIC=DIC[mode]; // スライド辞書用シンボルの取得
    const _EOF=EOF[mode]; // データ終端用のシンボルの取得

    let symbolTotalTable=[];
    for(let i=0; i<_symbolNum; i++) {
      symbolTotalTable.push(totalOffset);
    } // for i

    let expandedStr='';
    let tree=getHuffmanTree(symbolTotalTable,_symbolNum);
    let node=tree;

    let symbolCnt=0;
    const len=codeBuf.length;
    let index=0;
    while(bytePos<len) {
      node=readBit() ? node.right : node.left;
      if(node.symbol>=0) { //シンボルに達した
        if(node.symbol===_EOF) {
          break;
        } else if(node.symbol===_DIC) { // スライド辞書がヒットした
          const decoded=decodeInt();
          if(decoded<0) {
            return null;
          } // if
          const matchLen=decoded+3;
          if(matchLen>matchLimit) {
            return null;
          } // if
          let offset=0;
          const bits=getRequiredBits(Math.min(index-1,dictionarySize-1));
          for(let i=0; i<bits; i++) {
            if(bytePos>=len) {
              return null;
            } // if
            offset=(offset<<1)+readBit();
          } // for i
          if(offset>=index) {
            return null;
          } // if
          for(let i=0; i<matchLen; i++) {
            expandedStr+=expandedStr[index-offset-1+i];
          } // for i
          index+=matchLen;
        } else {
          expandedStr+=String.fromCharCode(node.symbol);
          index++;
        } //if
        symbolTotalTable[node.symbol]++;
        symbolCnt++;
        if(symbolCnt<256 || symbolCnt%8===0) {
          tree=getHuffmanTree(symbolTotalTable,_symbolNum);
        } // if
        node=tree;
      } // if
    } // while

    if(mode===0) { // モード0ならUTF8をUTF16にデコード
      expandedStr=decodeUtf8(expandedStr);
      if(expandedStr===null) {
        return null;
      } // if
    } else if(mode===3) {
      str='';
      for(let len=expandedStr.length,i=0; i<len; i++) {
        str+=String.fromCharCode(mode3DecodeTable[expandedStr.charCodeAt(i)]);
      } // for i
      expandedStr=str;
    } // if
    return expandedStr;
  } // expand      

  return {
    compress  :compress,
    expand    :expand,
    encodeUtf8:encodeUtf8,
    decodeUtf8:decodeUtf8
  };
})(); // URLCompressor

// for Node.js
if(typeof module!=='undefined' && module!=null) {
  module.exports=URLCompressor;
} // if
