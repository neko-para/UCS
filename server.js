const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 6658 });

let sizex = 10, sizey = 10;
let clients = [];
let len = 2;

wss.on('connection', function (ws) {
	console.log('new connection');
	clients.push(ws);
	if (clients.length == len) {
		(function (peer) {
			let id = 0;
			let height = [];
			for (let i = 0; i < sizex; ++i) {
				let h = [];
				for (let j = 0; j < sizey; ++j) {
					h.push(Math.round(Math.random() * 6 - 2));
				}
				height.push(h);
			}
			for (let i = 0; i < len; ++i) {
				let c = peer[i];
				console.log('send map info');
				c.send(JSON.stringify({
					action: 'start',
					sizex: sizex,
					sizey: sizey,
					height: height,
					id: i
				}));
				c.on('message', function (message) {
					let data = JSON.parse(message);
					if (data.action == 'create') {
						data.item.hash = id++;
					}
					for (let i = 0; i < len; ++i) {
						peer[i].send(JSON.stringify(data));
					}
				});
			};
		})(clients);
		clients = [];
	}
});