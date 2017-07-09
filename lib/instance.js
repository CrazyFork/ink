'use strict';

const arrify = require('arrify');
const Newline = require('./components/newline');
const Div = require('./components/div');
const Span = require('./components/span');
const transformProps = require('./transform-props');
const Component = require('./component');
const VNode = require('./vnode');

const isClassComponent = component => component.prototype instanceof Component;

const instances = new WeakMap();

const getInstance = vnode => instances.get(vnode);

const getOrCreateInstance = vnode => {
	let instance = getInstance(vnode);

	if (!instance) {
		instance = new Instance(vnode); // eslint-disable-line no-use-before-define
		instances.set(vnode, instance);
	}

	return instance;
};

const getComponent = name => {
	switch (name) {
		case 'div': return Div;
		case 'span': return Span;
		case 'br': return Newline;
		default: return null;
	}
};

class Instance {
	constructor(vnode) {
		this.vnode = vnode;
		this.component = typeof this.vnode.component === 'string' ? getComponent(this.vnode.component) : this.vnode.component;
		this.isClassComponent = isClassComponent(this.component);
		this.instance = null;
		this.context = {};
		this.mountScheduled = false;
		this.updateScheduled = false;
	}

	get props() {
		return this.vnode.props;
	}

	set props(nextProps) {
		this.vnode.props = transformProps(nextProps);

		if (this.isClassComponent) {
			this.instance.componentWillReceiveProps(this.props);
		}
	}

	get children() {
		return this.vnode.children;
	}

	set children(nextChildren) {
		this.vnode.children = arrify(nextChildren);

		return nextChildren;
	}

	mount() {
		if (this.isClassComponent) {
			const instance = new this.component(this.props, this.context); // eslint-disable-line new-cap
			instance._onUpdate = this.onUpdate;
			Object.assign(this.context, instance.getChildContext());
			instance.componentWillMount();

			this.children = instance._render();
			this.instance = instance;
		} else {
			this.children = this.component(this.props, this.context);
		}

		this.children.forEach(child => {
			if (child instanceof VNode) {
				const childInstance = getOrCreateInstance(child);
				childInstance.onUpdate = this.onUpdate;
				childInstance.context = this.context;
				childInstance.mount();
			}
		});

		this.mountScheduled = true;
	}

	didMount() {
		if (this.mountScheduled && this.isClassComponent) {
			this.mountScheduled = false;
			this.instance.componentDidMount();

			if (this.vnode.ref) {
				this.vnode.ref(this.instance);
			}
		}
	}

	unmount() {
		if (this.isClassComponent && this.instance) {
			this.instance.componentWillUnmount();
		}

		this.children.forEach(child => {
			if (child instanceof VNode) {
				const childInstance = getInstance(child);
				childInstance.unmount();
			}
		});

		if (this.isClassComponent && this.instance) {
			this.instance.componentDidUnmount();
			this.instance = null;

			if (this.vnode.ref) {
				this.vnode.ref(null);
			}
		}
	}

	get nextState() {
		return this.instance._pendingState || this.instance.state;
	}

	rerender() {
		if (this.isClassComponent) {
			this.instance.componentWillUpdate(this.props, this.nextState);
			this.instance.props = this.props;
			this.instance.state = this.nextState;
			this.instance._pendingState = null;
			this.children = arrify(this.instance._render());
			this.updateScheduled = true;

			return;
		}

		this.children = arrify(this.component(this.props, this.context));
	}

	didUpdate() {
		if (this.updateScheduled && this.isClassComponent) {
			this.updateScheduled = false;
			this.instance.componentDidUpdate();

			if (this.instance._stateUpdateCallback) {
				this.instance._stateUpdateCallback();
				this.instance._stateUpdateCallback = null;
			}
		}
	}

	shouldComponentUpdate(nextProps) {
		return this.isClassComponent ? this.instance.shouldComponentUpdate(nextProps, this.nextState) : true;
	}

	renderString(children) {
		return this.instance.renderString(children);
	}
}

module.exports = Instance;
module.exports.getInstance = getInstance;
module.exports.getOrCreateInstance = getOrCreateInstance;
