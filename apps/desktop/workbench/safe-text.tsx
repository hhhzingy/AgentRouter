import React from 'react';
/** 受控文本展示：不解释 HTML，不创建外链导航，不执行任何代码。 */
export function SafeText({text}:{text:string}){
 const blocks=text.split(/(```[^\n]*\n[\s\S]*?```)/g);
 return <div className="safe-text">{blocks.map((block,i)=>block.startsWith('```')?<pre key={i}><code>{block.replace(/^```[^\n]*\n/,'').replace(/```$/,'')}</code></pre>:<p key={i}>{block.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,j)=>part.startsWith('**')?<strong key={j}>{part.slice(2,-2)}</strong>:part.startsWith('`')?<code key={j}>{part.slice(1,-1)}</code>:part)}</p>)}</div>;
}
