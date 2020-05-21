// eslint-disable-next-line import/no-unresolved
import * as vscode from 'vscode';
import * as MarkdownIt from 'markdown-it';
// @ts-ignore
import * as Katex from 'markdown-it-katex';

import axios from 'axios';

class Markdown extends MarkdownIt {
    constructor() {
        super({
            linkify: true,
        });
        this.linkify.tlds('.py', false);
        this.use(Katex);
    }
}

const md = new Markdown();

namespace Storage {
    let state: vscode.Memento;
    export function init(context: vscode.ExtensionContext) {
        state = context.globalState;
    }
    export function set(key: string, value: string) {
        state.update(key, value);
    }
    export function get(key: string) {
        return state.get(key);
    }
}

namespace View {
    const statusBar = vscode.window.createStatusBarItem();
    statusBar.command = 'hydro.userInfo';
    export function updateStatusBar() {
        if (Storage.get('sessionId')) { statusBar.text = 'Logged in'; } else { statusBar.text = 'Not logged in'; }
        statusBar.show();
    }
}

namespace Command {
    export async function configure() {
        let url = await vscode.window.showInputBox({
            placeHolder: 'URL',
            ignoreFocusOut: true,
            validateInput: async (input: string) => {
                const RE_URL = /(https?:\/\/)?.*?\..*?\/?/i;
                if (!RE_URL.test(input)) { return 'Not a valid URL'; }
                if (!input.startsWith('http')) { input = `http://${input}`; }
                let res;
                try {
                    res = await axios.get(input);
                } catch (e) {
                    return `Cannot connect to server: ${e.message}`;
                }
                return res.data.version;
            },
        });
        if (!url) return;
        if (!url.startsWith('http')) {
            url = `http://${url}`;
        }
        Storage.set('baseUrl', url);
        vscode.window.showInformationMessage('Done.');
    }
    export async function problem() {
        if (!Storage.get('baseUrl')) {
            vscode.window.showErrorMessage('Please run hydro.configure first.');
            return;
        }
        const pid = await vscode.window.showInputBox({
            placeHolder: 'Pid',
            ignoreFocusOut: true,
        });
        const res = await axios.get(`${Storage.get('baseUrl')}/p/${pid}`);
        const { pdoc } = res.data;
        const panel = vscode.window.createWebviewPanel(pdoc._id, `${pdoc.pid}: ${pdoc.title}`, vscode.ViewColumn.Two, {
            enableScripts: true,
        });
        panel.webview.html = md.render(pdoc.content);
    }
    export async function login() {
        if (!Storage.get('baseUrl')) {
            vscode.window.showErrorMessage('Please run hydro.configure first.');
            return;
        }
        const username = await vscode.window.showInputBox({ placeHolder: 'Username' });
        if (!username) { return; }
        const password = await vscode.window.showInputBox({ placeHolder: 'Password', password: true });
        if (!password) { return; }
        const res = await axios.post(`${Storage.get('baseUrl')}/login`, { username, password });
        Storage.set('sessionId', res.headers['set-cookie'].join('\n'));
        View.updateStatusBar();
    }
    export async function logout() {
        if (!Storage.get('sessionId')) {
            vscode.window.showErrorMessage('Not logged in');
        }
        await axios.post(`${Storage.get('baseUrl')}/logout`, {}, { headers: { cookie: Storage.get('sessionId') } });
        Storage.set('sessionId', '');
        View.updateStatusBar();
    }
}

export function activate(context: vscode.ExtensionContext) {
    Storage.init(context);
    context.subscriptions.push(vscode.commands.registerCommand('hydro.configure', Command.configure));
    context.subscriptions.push(vscode.commands.registerCommand('hydro.problem', Command.problem));
    context.subscriptions.push(vscode.commands.registerCommand('hydro.login', Command.login));
    context.subscriptions.push(vscode.commands.registerCommand('hydro.logout', Command.logout));
    View.updateStatusBar();
}

export function deactivate() {
    console.log('deactivate');
}
