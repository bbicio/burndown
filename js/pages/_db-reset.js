
  const SCOPES = [
    { scope: 'proposals', title: 'Proposals', description: 'Deletes all cost grids, versions, phases, tasks, task roles, and related sharing records.', buttonText: 'Delete all proposals', label: 'all proposals (cost grids, versions, phases, tasks)' },
    { scope: 'projects', title: 'Projects & Programs', description: 'Deletes all projects (including tasks and planning data) and all programs. Cost grids are not affected.', buttonText: 'Delete all projects & programs', label: 'all projects and programs' },
    { scope: 'clients', title: 'Clients & Client Groups', description: 'Deletes all clients, client groups, and their POTs. Client references on proposals and projects are set to null.', buttonText: 'Delete all clients & groups', label: 'all clients and client groups' },
    { scope: 'ratecards', title: 'Client Ratecards', description: 'Deletes all ratecards that are linked to a specific client (agency-wide ratecards without a client are not affected). Ratecard references on versions are set to null.', buttonText: 'Delete all client ratecards', label: 'all client ratecards' },
    { scope: 'actuals', title: 'Actuals (Timesheets)', description: 'Deletes all uploaded timesheet data. Project structure is not affected.', buttonText: 'Delete all actuals', label: 'all timesheet actuals' },
    { scope: 'pipelines', title: 'Pipeline Years & POTs', description: 'Deletes all pipeline years and all POT targets with their history. Proposals already in SIP/Committed are not affected.', buttonText: 'Delete all pipeline years & POTs', label: 'all pipeline years and POTs' },
    { scope: 'notifications', title: 'Notifications', description: 'Deletes all in-app notifications for all users. Push/email history sent is not affected.', buttonText: 'Delete all notifications', label: 'all notifications for all users' },
  ];

  Vue.createApp({
    data() {
      return {
        ready: false,
        accessDenied: false,
        me: {},
        scopes: SCOPES,

        pendingScope: null,
        pendingCgId: null,
        confirmText: '',
        confirmInputValue: '',
        confirmBusy: false,
        scopeDoneFlag: null,
        scopeErrorMsg: '',

        cgIdInput: '',
        cgDeleteMsg: null,

        cgOwnerIdInput: '',
        ownerSelected: '',
        ownerOptions: [],
        ownerOptionsLoaded: false,
        ownerLoadFailed: false,
        ownerChangeBusy: false,
        cgOwnerMsg: null,
      };
    },
    async created() {
      const user = await initNav('dbreset', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'DB Reset' },
      ]});
      if (!user) return;
      this.me = user;
      if (user.role !== 'sysadmin') { this.accessDenied = true; return; }
      await this.loadActiveUsers();
      this.ready = true;
    },
    mounted() {
      document.getElementById('confirmModal').addEventListener('hidden.bs.modal', () => {
        this.pendingScope = null;
        this.pendingCgId = null;
        this.confirmInputValue = '';
      });
    },
    methods: {
      openScopeConfirm(scope) {
        this.pendingScope = scope;
        this.pendingCgId = null;
        this.scopeErrorMsg = '';
        const s = this.scopes.find(x => x.scope === scope);
        this.confirmText = 'You are about to permanently delete ' + s.label + '.';
        this.confirmInputValue = '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
      },
      openCgDeleteConfirm() {
        const cgId = this.cgIdInput.trim();
        if (!cgId) return;
        this.pendingCgId = cgId;
        this.pendingScope = null;
        this.confirmText = 'You are about to permanently delete cost grid ' + cgId + ' and all its linked projects.';
        this.confirmInputValue = '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
      },
      async confirmDelete() {
        if (this.confirmInputValue.trim() !== 'DELETE') return;
        if (this.pendingScope) return this._doScopeDelete();
        if (this.pendingCgId)  return this._doCgDelete();
      },
      async _doScopeDelete() {
        const scope = this.pendingScope;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/' + scope, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();

          if (!res.ok) {
            this.scopeErrorMsg = 'Error: ' + (data.error || 'Unknown error');
            return;
          }

          this.scopeDoneFlag = { scope };
          setTimeout(() => { this.scopeDoneFlag = null; }, 3000);
        } catch (e) {
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
          this.scopeErrorMsg = 'Network error: ' + e.message;
        } finally {
          this.confirmBusy = false;
        }
      },
      async _doCgDelete() {
        const cgId = this.pendingCgId;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/cost-grid/' + encodeURIComponent(cgId), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();

          if (!res.ok) {
            this.cgDeleteMsg = { text: 'Error: ' + (data.error || 'Unknown error'), isError: true };
            return;
          }

          this.cgDeleteMsg = { text: `✓ Deleted "${data.cgName}" and ${data.projectsDeleted} linked project(s).`, isError: false };
          this.cgIdInput = '';
        } catch (e) {
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
          this.cgDeleteMsg = { text: 'Network error: ' + e.message, isError: true };
        } finally {
          this.confirmBusy = false;
        }
      },
      async loadActiveUsers() {
        try {
          const res = await fetch('/api/users/active-list', { credentials: 'include' });
          const users = await res.json();
          this.ownerOptions = users.map(u => ({ id: u.id, label: `${u.first_name} ${u.last_name} (${u.email})` }));
        } catch (e) {
          this.ownerOptions = [];
          this.ownerLoadFailed = true;
        } finally {
          this.ownerOptionsLoaded = true;
        }
      },
      async changeOwner() {
        const cgId = this.cgOwnerIdInput.trim();
        const ownerId = this.ownerSelected;
        this.cgOwnerMsg = null;

        if (!cgId || !ownerId) {
          this.cgOwnerMsg = { text: 'Cost grid UUID and new owner are required.', isError: true };
          return;
        }

        this.ownerChangeBusy = true;
        try {
          const res = await fetch('/api/admin/reset/cost-grid/' + encodeURIComponent(cgId) + '/owner', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId }),
          });
          const data = await res.json();

          if (!res.ok) {
            this.cgOwnerMsg = { text: 'Error: ' + (data.error || 'Unknown error'), isError: true };
          } else {
            this.cgOwnerMsg = { text: `✓ "${data.cgName}" is now owned by ${data.newOwner}.`, isError: false };
            this.cgOwnerIdInput = '';
            this.ownerSelected = '';
          }
        } catch (e) {
          this.cgOwnerMsg = { text: 'Network error: ' + e.message, isError: true };
        } finally {
          this.ownerChangeBusy = false;
        }
      },
    },
  }).mount('#app');
