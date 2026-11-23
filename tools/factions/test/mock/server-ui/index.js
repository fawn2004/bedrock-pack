// Forms record what they'd show; tests choose answers via globalThis.formAnswers.
export const shown = [];
globalThis.formAnswers = [];
class Base { constructor() { this.data = { title: "", body: "", buttons: [], fields: [] }; }
  title(t) { this.data.title = t; return this; } body(b) { this.data.body = b; return this; }
  button(t, i) { this.data.buttons.push({ t, i }); return this; }
  textField(l, p, o) { this.data.fields.push(["text", l]); return this; } dropdown(l, items, o) { this.data.fields.push(["dropdown", l, items]); return this; }
  toggle(l, o) { this.data.fields.push(["toggle", l]); return this; } slider(l, a, b, o) { this.data.fields.push(["slider", l]); return this; }
  submitButton() { return this; } label() { return this; } header() { return this; } divider() { return this; }
  show(player) { shown.push(this.data); const a = globalThis.formAnswers.shift(); if (a === undefined) return Promise.resolve({ canceled: true });
    return Promise.resolve(typeof a === "number" ? { canceled: false, selection: a } : { canceled: false, formValues: a }); } }
export class ActionFormData extends Base {}
export class ModalFormData extends Base {}
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
