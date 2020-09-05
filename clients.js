let ws = new WebSocket('ws://localhost:6658');

let canvas = document.getElementById('main');
let info = document.getElementById('info');
let itemSp = document.getElementById('item');
let ctx = canvas.getContext('2d');

let sizex = 0, sizey = 0;
let offsetx = 0, offsety = 0;
let width = 640, height = 480;
let wwidth = 0, wheight = 0;
let blocksz = 100;
let dx = 0, dy = 0;
let prex = null, prey = null;
let pcx, pcy;
let moving = null;

let id = 0;
let items = [];
let preselect = null, select = null;
let selectSkip = 0;

let seleInfo = '';

let money = 0;
let dmoney = 0;

// let randomBuffer = [];

const Data = {
	armor: {
		time: 10000,
		cost: 4,
		attack: 5,
		speed: 200,
		up: 0.5,
		down: 0.3
	},
	infantry: {
		time: 1000,
		cost: 1,
		attack: 1,
		speed: 500,
		up: 0.2,
		down: 0.1
	},
	city: {
		time: 50000,
		cost: 20,
		defend: 0.1
	},
	fortress: {
		time: 10000,
		cost: 5,
		defend: 0.4
	}
};

let altitude = null;
let view = null;

let altiColor = [
	'#7F7FFF',
	'#CFCFFF',
	'#FFFFFF',
	'#FFFFCF',
	'#FFFF7F',
	'#FFFF3F',
	'#FFFF00'
];

function render() {
	ctx.save();
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, width, height);
	ctx.translate(-offsetx, -offsety);
	for (let x = 0; x < sizex; ++x) {
		for (let y = 0; y < sizey; ++y) {
			ctx.fillStyle = altiColor[altitude[x][y] + 2];
			ctx.fillRect(x * blocksz, y * blocksz, blocksz, blocksz);
			if (!view[x][y]) {
				ctx.fillStyle = '#0000007F';
				ctx.fillRect(x * blocksz, y * blocksz, blocksz, blocksz);
			}
		}
	}
	items.forEach(i => {
		if (!view[i.posx][i.posy]) {
			return;
		}
		if (i.id == 0) {
			ctx.fillStyle = '#7F0000';
			ctx.strokeStyle = '#FF0000';
		} else {
			ctx.fillStyle = '#007F00';
			ctx.strokeStyle = '#00FF00';
		}
		switch (i.type) {
			case 'building':
				ctx.fillRect(i.posx * blocksz + 5, i.posy * blocksz + 5, blocksz - 10, blocksz - 10);
				break;
			case 'unit':
				ctx.beginPath();
				ctx.arc(i.posx * blocksz + blocksz / 2, i.posy * blocksz + blocksz / 2, blocksz / 2 - 2, 0, Math.PI * 2);
				ctx.fill();
				break;
		}
		if (select == i) {
			ctx.strokeStyle = '#FFFFFF';
			ctx.strokeRect(i.posx * blocksz + 2, i.posy * blocksz + 2, blocksz - 4, blocksz - 4);
		}
	});
	ctx.restore();
}

document.oncontextmenu = function (e) {
	e.preventDefault();
};

function updateInfo() {
	info.innerText = `Money: ${money}\n\n${seleInfo}`;
}

function resolveAction(item) {
	if (item.actionQueue.length == 0) {
		return;
	}
	if (item.timeout) {
		return;
	}
	let act = item.actionQueue[0];
	switch (act.action) {
	case 'create': {
		if (item.cata == 'city') {
			item.timeout = setTimeout(() => {
				newItem({
					id: id,
					type: 'unit',
					state: 1,
					cata: act.type,
					posx: item.posx,
					posy: item.posy
				});
				item.actionQueue = item.actionQueue.slice(1);
				item.timeout = null;
				resolveAction(item);
			}, Data[act.type].time);
		} else if (item.cata == 'infantry') {
			item.timeout = setTimeout(() => {
				newItem({
					id: id,
					type: 'building',
					cata: act.type,
					posx: item.posx,
					posy: item.posy
				});
				item.actionQueue = item.actionQueue.slice(1);
				item.timeout = null;
				resolveAction(item);
			}, Data[act.type].time);
		}
		break;
	}
	case 'move': {
		if (item.posx == act.x && item.posy == act.y) {
			item.actionQueue = item.actionQueue.slice(1);
			resolveAction(item);
			return;
		}
		let dx = 0, dy = 0;
		if (item.posx == act.x) {
			dy = item.posy < act.y ? 1 : -1;
		} else if (item.posy == act.y) {
			dx = item.posx < act.x ? 1 : -1;
		} else {
			if (act.ph) {
				dx = item.posx < act.x ? 1 : -1;
			} else {
				dy = item.posy < act.y ? 1 : -1;
			}
		}
		ws.send(JSON.stringify({
			action: 'move',
			hash: item.hash,
			dx: dx,
			dy: dy
		}));
		let time = Data[item.cata].speed;
		let dh = altitude[item.posx][item.posy] - altitude[item.posx + dx][item.posy + dy];
		if (dh > 0) {
			time *= 1 + Data[item.cata].down * dh;
		} else {
			time *= 1 - Data[item.cata].up * dh;
		}
		item.timeout = setTimeout(() => {
			item.timeout = null;
			resolveAction(item);
		}, time);
		break;
	}
	}
}

function queryItemAt(x, y) {
	let itemList = [];
	for (let i = 0; i < items.length; ++i) {
		let item = items[i];
		if (item.posx == x && item.posy == y) {
			itemList.push(item);
		}
	}
	return itemList;
}

document.onclick = function (e) {
	if (!preselect) {
		let x = e.clientX, y = e.clientY;
		x += offsetx;
		y += offsety;
		x = Math.floor(x / blocksz);
		y = Math.floor(y / blocksz);
		if (!view[x][y]) {
			seleInfo = `Type: block\nHeight: ${altitude[x][y]}`;
			itemSp.innerText = `Height: ${altitude[x][y]}`;
			select = null;
			updateInfo();
			render();
			return;
		}
		if (pcx == x && pcy == y) {
			++selectSkip;
		} else {
			pcx = x;
			pcy = y;
			selectSkip = 0;
		}
		select = null;
		info.innerText = '';
		let itemList = queryItemAt(x, y);
		itemList.push(null);
		select = itemList[selectSkip % itemList.length];
		if (select) {
			seleInfo = `Type: ${select.type}\nCatagory: ${select.cata}\n` + (select.id == id ? 'This is your unit.' : '');
		} else {
			seleInfo = `Type: block\nHeight: ${altitude[x][y]}`;
		}
		let itemStr = '';
		itemList.forEach(i => {
			if (i) {
				itemStr += `${select == i ? '>' : ''}${i.type} ${i.cata} ${i.id}\n`;
			} else {
				itemStr += `Height: ${altitude[x][y]}`;
			}
		});
		itemSp.innerText = itemStr;
		updateInfo();
		render();
	}
};

document.onmousedown = function (e) {
	if (e.button == 0) {
		preselect = null;
		prex = e.screenX;
		prey = e.screenY;
		if (moving) {
			clearInterval(moving);
			moving = null;
		}
	}
};

document.onmouseup = function (e) {
	if (prex && e.button == 0) {
		prex = null;
		prey = null;
	} else if (e.button == 2) {
		if (select && select.id == id && select.type == 'unit') {
			let x = e.clientX, y = e.clientY;
			x += offsetx;
			y += offsety;
			let bx = Math.floor(x / blocksz);
			let by = Math.floor(y / blocksz);
			x -= bx * blocksz + blocksz / 2;
			y -= by * blocksz + blocksz / 2;
			if (bx != select.posx || by != select.posy) {
				let ddx = bx - select.posx, ddy = by - select.posy;
				let prefH = false; // horizontal first
				if (ddx && ddy) {
					if (ddx * ddy > 0) {
						prefH = (x - y) * ddx > 0;
					} else {
						prefH = (x + y) * ddx > 0;
					}
				}
				let act = {
					action: 'move',
					x: bx,
					y: by,
					ph: prefH
				};
				if (e.shiftKey) {
					select.actionQueue.push(act);
				} else {
					select.actionQueue = [act];
				}
				resolveAction(select);
			}
		}
	}
};

function updateView() {
	let Dx = [ 0, 1, 1, 1, 0, -1, -1, -1 ];
	let Dy = [ -1, -1, 0, 1, 1, 1, 0, -1 ];
	view = Array(sizex);
	for (let i = 0; i < sizex; ++i) {
		view[i] = Array(sizey).fill(false);
	}
	items.forEach(o => {
		if (o.id != id) {
			return;
		}
		let baseh = altitude[o.posx][o.posy];
		switch (o.type) {
		case 'building':
			view[o.posx][o.posy] = true;
			for (let i = 0; i < 8; ++i) {
				let nx = o.posx + Dx[i];
				let ny = o.posy + Dy[i];
				if (nx < 0 || ny < 0 || nx >= sizex || ny >= sizey) {
					continue;
				}
				view[nx][ny] = view[nx][ny] || altitude[nx][ny] <= baseh;
			}
			break;
		case 'unit': {
			let x = o.posx, y = o.posy;
			view[x][y] = true;
			for (let i = 0; i < 8; ++i) {
				let nx = x, ny = y;
				for (let j = 0; j < 3; ++j) {
					nx += Dx[i];
					ny += Dy[i];
					if (nx < 0 || ny < 0 || nx >= sizex || ny >= sizey) {
						break;
					}
					if (altitude[nx][ny] > baseh) {
						break;
					}
					view[nx][ny] = true;
				}
			}
			let test = (dx, dy) => {
				let nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= sizex || ny >= sizey) {
					return false;
				}
				if (altitude[nx][ny] <= baseh) {
					view[nx][ny] = true;
					return true;
				} else {
					return false;
				}
			}
			for (let mx = -1; mx < 2; mx += 2) {
				for (let my = -1; my < 2; my += 2) {
					if (test(mx, my)) {
						if (test(mx, my * 2)) {
							test(mx, my * 3);
							test(mx * 2, my * 3);
						}
						if (test(mx * 2, my)) {
							test(mx * 3, my);
							test(mx * 3, my * 2);
						}
					}
				}
			}
			break;
		}
		}
	});
}

function updatePos(dx, dy) {
	offsetx = offsetx + dx;
	offsety = offsety + dy;
	if (offsetx < 0) {
		offsetx = 0;
	} else if (offsetx + width >= wwidth) {
		offsetx = wwidth - width - 1;
	}
	if (offsety < 0) {
		offsety = 0;
	} else if (offsety + height >= wheight) {
		offsety = wheight - height - 1;
	}
	render();
}

document.onmousemove = function (e) {
	if (prex) {
		let x = e.screenX, y = e.screenY;
		updatePos(prex - x, prey - y);
		prex = x;
		prey = y;
		preselect = select;
	} else {
		let x = e.clientX, y = e.clientY;
		if (x < 10) {
			dx = -20;
		} else if (x < 50) {
			dx = -10;
		} else if (x >= width) {
			dx = 0;
		} else if (x + 10 >= width) {
			dx = 20;
		} else if (x + 50 >= width) {
			dx = 10;
		} else {
			dx = 0;
		}
		if (y < 10) {
			dy = -20;
		} else if (y < 50) {
			dy = -10;
		} else if (y >= height) {
			dy = 0;
		} else if (y + 10 >= height) {
			dy = 20;
		} else if (y + 50 >= height) {
			dy = 10;
		} else {
			dy = 0;
		}
		if (dx || dy) {
			if (!moving) {
				moving = setInterval(() => {
					updatePos(dx, dy);
				}, 100);
			}
		} else {
			if (moving) {
				clearInterval(moving);
				moving = null;
			}
		}
	}
};

document.onkeypress = function (e) {
	if (select && select.id == id) {
		switch (select.cata) {
		case 'city':
			switch (e.which) {
			case 97: // a
				if (money >= Data.armor.cost) {
					money -= Data.armor.cost;
					select.actionQueue.push({
						action: 'create',
						type: 'armor'
					});
				}
				break;
			case 105: // i
				if (money >= Data.infantry.cost) {
					money -= Data.infantry.cost;
					select.actionQueue.push({
						action: 'create',
						type: 'infantry'
					});
				}
				break;
			}
			break;
		case 'infantry':
			if (!queryItemAt(select.posx, select.posy).filter(i => { return i.type == 'building'; }).length) {
				switch (e.which) {
				case 99:
					if (money >= Data.city.cost) {
						money -= Data.city.cost;
						select.actionQueue.push({
							action: 'create',
							type: 'city'
						});
					}
					break;
				case 102:
					if (money >= Data.fortress.cost) {
						money -= Data.fortress.cost;
						select.actionQueue.push({
							action: 'create',
							type: 'fortress'
						});
					}
					break;
				}
			}
		}
		updateInfo();
		resolveAction(select);
	}
};

function newItem(item) {
	ws.send(JSON.stringify({
		action: 'create',
		item: item
	}));
}

ws.onmessage = function (e) {
	let data = JSON.parse(e.data);
	switch (data.action) {
		case 'start': {
			sizex = data.sizex;
			sizey = data.sizey;
			wwidth = sizex * blocksz;
			wheight = sizey * blocksz;
			altitude = data.height;
			id = data.id;
			switch (id) {
			case 0:
				newItem({
					id: 0,
					type: 'building',
					cata: 'city',
					posx: 0,
					posy: 0
				});
				break;
			case 1:
				newItem({
					id: 1,
					type: 'building',
					cata: 'city',
					posx: sizex - 1,
					posy: sizey - 1
				});
				break;
			}
			setInterval(() => {
				money += dmoney;
				updateInfo();
			}, 5000);
			updateView();
			render();
			break;
		}
		case 'create': {
			items.push({ ...data.item, actionQueue: [] });
			if (data.item.cata == 'city' && data.item.id == id) {
				++dmoney;
			}
			updateView();
			render();
			break;
		}
		case 'move': {
			let its = items.filter(i => { return i.hash == data.hash; });
			console.log(its);
			if (its.length == 0) {
				console.log('cannot find item');
				break;
			}
			let item = its[0];
			let nx = item.posx + data.dx;
			let ny = item.posy + data.dy;
			let dh = altitude[nx][ny] - altitude[item.posx][item.posy];
			let tits = queryItemAt(nx, ny);
			let state = {
				infantry: 0,
				armor: 0
			};
			let battle = false;
			let def = 0;
			for (let i = 0; i < tits.length; ++i) {
				let obj = tits[i];
				if (obj.type == 'building') {
					def = Data[obj.cata].defend;
				} else {
					if (obj.id == id) {
						break;
					} else {
						battle = true;
						state[obj.cata] += obj.state;
					}
				}
			}

			item.posx += data.dx;
			item.posy += data.dy;

			updateView();
			render();
			break;
		}
		// case 'random':
			// randomBuffer.push(data.data);
			// break;
	}
}