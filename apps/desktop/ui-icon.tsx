// Local geometric icons carried from the reviewed design prototype; no icon font or network.
const paths={sidebar:'M2 2h12v12H2zM6 2v12',file:'M4 1h5l3 3v11H4zM9 1v4h3',copy:'M6 5h7v9H6zM10 5V2H3v9h3',close:'m4 4 8 8M12 4l-8 8',more:'M3 8h.01M8 8h.01M13 8h.01',chevron:'m5 6 3 3 3-3'};
export function UiIcon({name}:{name:keyof typeof paths}){return <svg className="ui-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>;}
