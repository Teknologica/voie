import StateManager from '../../src/state-manager';
import { createMemoryHistory } from 'history';

describe('Transitions', function() {

  beforeEach(() => {
    const root = document.createElement('div');
    root.setAttribute('id', 'root');
    document.body.appendChild(root);
  });

  afterEach(() => {
    const root = document.getElementById('root');
    document.body.removeChild(root);
  });

  it('should leave upstream and enter downstream states', function() {
    const sm = createStateManager();
    const entered = [];
    const left = [];
    ['app', 'users', 'users.list', 'groups', 'groups.list'].forEach(name => {
      const state = sm.get(name);
      const e = state.enter;
      const l = state.leave;
      state.enter = (ctx) => { entered.push(state.name); return e(ctx); };
      state.leave = (ctx) => { left.push(state.name); return l(ctx) };
    });
    return sm.go('users.list')
      .then(() => {
        assert.include(entered, 'app');
        assert.include(entered, 'users');
        assert.include(entered, 'users.list');
        assert.notInclude(entered, 'groups');
        assert.notInclude(entered, 'groups.list');
        assert.notInclude(left, 'users.list');
        assert.notInclude(left, 'users');
        return sm.go('groups.list');
      })
      .then(() => {
        assert.include(left, 'users.list');
        assert.include(left, 'users');
        assert.notInclude(left, 'app');
        assert.notInclude(left, 'groups');
        assert.notInclude(left, 'groups.list');
        assert.include(entered, 'groups');
        assert.include(entered, 'groups.list');
      });
  });

  it('should allow visiting redirect-only states', function() {
    const sm = createStateManager();
    return sm.go('users')
      .then(() => {
        assert.equal(sm.context.state.name, 'users.list');
      });
  });

  it('should redirect with params', function() {
    const sm = createStateManager();
    return sm.go('groups')
      .then(() => {
        assert.equal(sm.context.state.name, 'groups.list');
        assert.equal(sm.context.params.sort, '+name');
      });
  });

  it('should load state data and render component in layout hierarchy', function() {
    const sm = createStateManager();
    return sm.go('users')
      .then(() => {
        assert.equal(document.querySelector('#root h1').innerText, 'Users');
        assert.lengthOf(document.querySelectorAll('#root li'), 3);
        assert.equal(document.querySelector('#root li:first-child').innerText, 'Alice');
      });
  });

  it('should dispose of stale components and render new data', function() {
    const sm = createStateManager();
    return sm.go('users')
      .then(() => sm.go('groups'))
      .then(() => {
        assert.lengthOf(document.querySelectorAll('#root h1'), 0);
        assert.lengthOf(document.querySelectorAll('#root li'), 2);
        assert.equal(document.querySelector('#root li:first-child').innerText, 'Admins');
      });
  });

  it('should support redirect via state.enter hook', function() {
    const sm = createStateManager();
    sm.get('groups.list').enter = () => ({ redirect: 'users' });
    return sm.go('groups')
      .then(() => {
        assert.equal(sm.context.state.name, 'users.list');
      });
  });

  it('should support rendering component via state.enter hook', function() {
    const sm = createStateManager();
    sm.get('groups.list').enter = () => ({
      component: { template: '<h2>Groups</h2>' }
    });
    return sm.go('groups')
      .then(() => {
        assert.equal(document.querySelector('h2#root').innerText, 'Groups');
      });
  });

  it('should detect redirect loops', function(done) {
    const sm = createStateManager();
    sm.get('groups.list').enter = () => ({ redirect: 'users' });
    sm.get('users.list').enter = () => ({ redirect: 'groups' });
    sm.go('groups')
      .then(() => done(new Error('Redirect loop not detected.')))
      .catch(err => {
        assert.isDefined(err.transition);
        done();
      });
  });

  it('should handle uncaught errors ', function() {
    const sm = createStateManager();
    let handled = null;
    sm.handleUncaught = function(err) {
      handled = err;
    };
    sm.get('users.list').enter = () => {
      throw new Error('oopsie');
    };
    return sm.go('users.list')
      .then(() => {
        assert.ok(handled);
        assert.equal(handled.message, 'oopsie');
      });
  });

  it('should allow redirecting on errors', function() {
    const sm = createStateManager();
    let handled = false;
    sm.get('users.list').enter = () => {
      throw new Error('oopsie');
    };
    sm.get('users.list').handleError = () => {
      handled = true;
      return { redirect: 'groups.list' };
    };
    return sm.go('users.list')
      .then(() => {
        assert.equal(handled, true);
        assert.equal(sm.context.state.name, 'groups.list');
      });
  });

  it('should render custom components on errors', function() {
    const sm = createStateManager();
    let handled = false;
    sm.get('users.list').enter = () => {
      throw new Error('oopsie');
    };
    sm.get('users.list').handleError = () => {
      handled = true;
      return { component: { template: '<h2>Error</h2>' } };
    };
    return sm.go('users.list')
      .then(() => {
        assert.equal(handled, true);
        assert.equal(document.querySelector('#root h2').innerText, 'Error');
      });
  });

  function createStateManager() {
    const sm = new StateManager({
      el: '#root',
      history: createMemoryHistory()
    });

    sm.add({ name: 'app' });

    sm.add({
      name: 'users',
      parent: 'app',
      redirect: 'users.list',
      component: {
        template: '<div class="users"><h1>Users</h1><v-view/></div>'
      }
    });

    sm.add({
      name: 'users.list',
      enter: (ctx) => {
        ctx.data.users = [
          { name: 'Alice' },
          { name: 'Bob' },
          { name: 'Greg' }
        ];
      },
      component: {
        template: '<ul><li v-for="user in users">{{ user.name }}</li></ul>'
      }
    });

    sm.add({
      name: 'groups',
      parent: 'app',
      redirect: {
        name: 'groups.list',
        params: {
          sort: '+name'
        }
      },
      enter: (ctx) => {
        ctx.data.groups = [
          { name: 'Admins' },
          { name: 'Guests'}
        ];
      }
    });

    sm.add({
      name: 'groups.list',
      params: {
        sort: null
      },
      component: {
        template: '<ul><li v-for="group in groups">{{ group.name }}</li></ul>'
      }
    });

    return sm;
  }

});
