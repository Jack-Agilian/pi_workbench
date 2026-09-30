/** Replaceable display/observation traffic is fenced by the owned connection and a
 * monotonic Worker sequence, not retained in the side-effect request replay cache. */
export class ObservationOrder {
  private readonly latest = { observation: 0, presentation: 0 };
  assertControl(requestId:string):void {
    if (/^(observation|presentation)-/.test(requestId)) throw new Error('reserved_observation_id');
  }
  accept(type: 'observation'|'presentation', requestId:string):boolean {
    const match=new RegExp(`^${type}-([1-9][0-9]*)$`).exec(requestId);
    const sequence=Number(match?.[1]);
    if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('observation_sequence');
    if(sequence<=this.latest[type])return false;
    this.latest[type]=sequence;return true;
  }
}
