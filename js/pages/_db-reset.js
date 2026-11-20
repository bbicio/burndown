
  const SCOPES = [
    { scope: 'proposals', title: 'Proposals', description: 'Deletes all cost grids, versions, phases, tasks, task roles, and related sharing records.', buttonText: 'Delete all proposals', label: 'all proposals (cost grids, versions, phases, tasks)' },
    { scope: 'projects', title: 'Projects & Programs', description: 'Deletes all projects (including tasks and planning data) and all programs. Cost grids are not affected.', buttonText: 'Delete all projects & programs', label: 'all projects and programs' },
    { scope: 'clients', title: 'Clients & Client Groups', description: 'Deletes all clients, client groups, and their POTs. Client references on proposals and projects are set to null.', buttonText: 'Delete all clients & groups', label: 'all clients and client groups' },
    { scope: 'ratecards', title: 'Client Ratecards', description: 'Deletes all ratecards that are linked to a specific client (agency-wide ratecards without a client are not affected). Ratecard references on versions are set to null.', buttonText: 'Delete all client ratecards', label: 'all client ratecards' },
    { scope: 'actuals', title: 'Actuals (Timesheets)', description: 'Deletes all uploaded timesheet data. Project structure is not affected.', buttonText: 'Delete all actuals', label: 'all timesheet actuals' },
    { scope: 'pipelines', title: 'Pipeline Years & POTs', description: 'Deletes all pipeline years and all POT targets with their history. Proposals already in SIP/Committed are not affected.', buttonText: 'Delete all pipeline years & POTs', label: 'all pipeline years and POTs' },
    { scope: 'notifications', title: 'Notifications', description: 'Deletes all in-app notifications for all users. Push/email history sent is not affected.', buttonText: 'Delete all notifications', label: 'all notifications for all users' },
  ];

  const LOST_TEXT = "The server's answer was lost — the deletion may have happened. Check before retrying.";

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
          const res = await apiSave('POST', '/admin/reset/' + scope);
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();

          if (res.kind === 'unknown') { this.scopeErrorMsg = LOST_TEXT; return; }
          if (res.kind !== 'ok') {
            this.scopeErrorMsg = 'Error: ' + (res.message || 'Unknown error');
            return;
          }

          this.scopeDoneFlag = { scope };
          setTimeout(() => { this.scopeDoneFlag = null; }, 3000);
        } finally {
          this.confirmBusy = false;
        }
      },
      async _doCgDelete() {
        const cgId = this.pendingCgId;
        this.confirmBusy = true;
        try {
          const res = await apiSave('POST', '/admin/reset/cost-grid/' + encodeURIComponent(cgId));
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();

          if (res.kind === 'unknown') { this.cgDeleteMsg = { text: LOST_TEXT, isError: true }; return; }
          if (res.kind !== 'ok') {
            this.cgDeleteMsg = { text: 'Error: ' + (res.message || 'Unknown error'), isError: true };
            return;
          }

          const data = res.data;
          this.cgDeleteMsg = { text: `✓ Deleted "${data.cgName}" and ${data.projectsDeleted} linked project(s).`, isError: false };
          this.cgIdInput = '';
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
          const res = await apiSave('PATCH', '/admin/reset/cost-grid/' + encodeURIComponent(cgId) + '/owner', { ownerId });

          if (res.kind !== 'ok') {
            this.cgOwnerMsg = { text: res.kind === 'unknown' ? res.message : 'Error: ' + (res.message || 'Unknown error'), isError: true };
          } else {
            this.cgOwnerMsg = { text: `✓ "${res.data.cgName}" is now owned by ${res.data.newOwner}.`, isError: false };
            this.cgOwnerIdInput = '';
            this.ownerSelected = '';
          }
        } finally {
          this.ownerChangeBusy = false;
        }
      },
    },
  }).mount('#app');
