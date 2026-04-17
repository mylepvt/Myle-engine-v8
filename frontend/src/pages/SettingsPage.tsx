import { useState, useEffect } from 'react'
import { PushNotificationToggle } from '@/components/notifications/PushNotificationToggle'
import { playSuccess } from '@/lib/click-sound'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  User,
  Bell,
  Shield,
  Settings as SettingsIcon,
  Lock,
  Mail,
  Users,
  Database,
} from 'lucide-react'
import { 
  useUserProfileQuery,
  useUserPreferencesQuery,
  useSystemConfigurationQuery,
  useSystemUsersSummaryQuery,
  useUserProfileUpdateMutation,
  useUserPreferencesUpdateMutation,
  useSystemConfigurationUpdateMutation,
  useAppSettingsQuery,
  useAppSettingUpdateMutation,
  useAppSettingDeleteMutation,
  usePasswordChangeMutation,
  useEmailChangeMutation,
  useAvatarUploadMutation,
} from '@/hooks/use-settings-query'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { type Role } from '@/types/role'
import { cn } from '@/lib/utils'
import { apiUrl } from '@/lib/api'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const { data: authData } = useAuthMeQuery()
  
  // Queries
  const userProfile = useUserProfileQuery()
  const userPreferences = useUserPreferencesQuery()
  const systemConfig = useSystemConfigurationQuery()
  const usersSummary = useSystemUsersSummaryQuery()
  const appSettings = useAppSettingsQuery()
  
  // Mutations
  const updateProfile = useUserProfileUpdateMutation()
  const updatePreferences = useUserPreferencesUpdateMutation()
  const updateSystemConfig = useSystemConfigurationUpdateMutation()
  const updateAppSetting = useAppSettingUpdateMutation()
  const deleteAppSetting = useAppSettingDeleteMutation()
  const changePassword = usePasswordChangeMutation()
  const changeEmail = useEmailChangeMutation()
  const avatarUpload = useAvatarUploadMutation()
  
  // Form states
  const [profileForm, setProfileForm] = useState({
    username: '',
    phone: '',
    name: '',
  })
  
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  
  const [emailForm, setEmailForm] = useState({
    new_email: '',
    current_password: '',
  })
  
  const [newSetting, setNewSetting] = useState({
    key: '',
    value: '',
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [settingError, setSettingError] = useState<string | null>(null)
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null)

  const userRole = authData?.role as Role | undefined
  const isAdmin = userRole === 'admin'

  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Sync form fields when profile data first arrives from the server.
  useEffect(() => {
    if (userProfile.data) {
      setProfileForm({
        username: userProfile.data.username || '',
        phone: userProfile.data.phone || '',
        name: userProfile.data.name || '',
      })
    }
  }, [userProfile.data])

  const handleProfileUpdate = () => {
    setProfileSuccess(null)
    setProfileError(null)
    updateProfile.mutate(profileForm, {
      onSuccess: () => { playSuccess(); setProfileSuccess('Profile updated successfully.') },
      onError: (e) => setProfileError(e instanceof Error ? e.message : 'Update failed.'),
    })
  }

  const handlePasswordChange = () => {
    setPasswordError(null)
    if (!passwordForm.current_password.trim()) {
      setPasswordError('Current password is required.')
      return
    }
    if (!passwordForm.new_password.trim()) {
      setPasswordError('New password is required.')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New passwords do not match.')
      return
    }
    changePassword.mutate(passwordForm, {
      onSuccess: () => {
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
        setPasswordError(null)
      },
      onError: (e) => setPasswordError(e instanceof Error ? e.message : 'Password change failed'),
    })
  }

  const handleEmailChange = () => {
    changeEmail.mutate(emailForm)
  }

  const handlePreferencesUpdate = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value })
  }

  const handleAppSettingUpdate = () => {
    setSettingError(null)
    if (!newSetting.key.trim() || !newSetting.value.trim()) {
      setSettingError('Both key and value are required.')
      return
    }
    updateAppSetting.mutate(newSetting, {
      onSuccess: () => {
        setNewSetting({ key: '', value: '' })
        setSettingError(null)
      },
      onError: (e) => setSettingError(e instanceof Error ? e.message : 'Failed to save setting'),
    })
  }

  const handleAppSettingDelete = (key: string) => {
    if (deleteConfirmKey === key) {
      deleteAppSetting.mutate(key, { onSettled: () => setDeleteConfirmKey(null) })
    } else {
      setDeleteConfirmKey(key)
    }
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Settings</h1>
            <p className="text-gray-600">
              Manage your profile, preferences, and system configuration
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            {authData?.role?.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className={cn(
            'flex h-auto w-full flex-wrap gap-1 p-1',
            isAdmin ? 'sm:grid sm:grid-cols-5' : 'sm:grid sm:grid-cols-3',
          )}
        >
          <TabsTrigger value="profile" className="min-h-9 flex-1 sm:flex-none">
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="min-h-9 flex-1 sm:flex-none">
            Preferences
          </TabsTrigger>
          <TabsTrigger value="security" className="min-h-9 flex-1 sm:flex-none">
            Security
          </TabsTrigger>
          {isAdmin ? (
            <>
              <TabsTrigger value="system" className="min-h-9 flex-1 sm:flex-none">
                System
              </TabsTrigger>
              <TabsTrigger value="advanced" className="min-h-9 flex-1 sm:flex-none">
                Advanced
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Basic Information
                </CardTitle>
                <CardDescription>
                  Update your personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-border dark:bg-muted">
                    {userProfile.data?.avatar_url ? (
                      <img
                        src={apiUrl(userProfile.data.avatar_url)}
                        alt={
                          userProfile.data.username
                            ? `Profile photo for ${userProfile.data.username}`
                            : userProfile.data.email
                              ? `Profile photo for ${userProfile.data.email}`
                              : 'Your profile photo'
                        }
                        className="size-full object-cover"
                        width={96}
                        height={96}
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-2xl text-gray-400">
                        {(userProfile.data?.username?.[0] ?? userProfile.data?.email?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="avatar-file">Profile photo (DP)</Label>
                    <input
                      id="avatar-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload profile photo"
                      className="mt-1 block w-full max-w-sm text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
                      disabled={avatarUpload.isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) avatarUpload.mutate(f)
                        e.target.value = ''
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-600 dark:text-muted-foreground">
                      JPEG, PNG, or WebP — max 2 MB. Shown in the header after save.
                    </p>
                    {avatarUpload.isError ? (
                      <p className="mt-1 text-xs text-red-600" role="alert">
                        {avatarUpload.error instanceof Error ? avatarUpload.error.message : 'Upload failed'}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <Label htmlFor="fbo_id">FBO ID</Label>
                  <Input
                    id="fbo_id"
                    value={userProfile.data?.fbo_id || '—'}
                    disabled
                    className="bg-muted/40 text-muted-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={userProfile.data?.email || '—'}
                    disabled
                    className="bg-muted/40 text-muted-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={profileForm.username}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <Button onClick={handleProfileUpdate} disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
                </Button>
                {profileSuccess ? (
                  <p className="text-sm text-emerald-500" role="status">{profileSuccess}</p>
                ) : null}
                {profileError ? (
                  <p className="text-sm text-destructive" role="alert">{profileError}</p>
                ) : null}
              </CardContent>
            </Card>

            {/* Account Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Account Status
                </CardTitle>
                <CardDescription>
                  Your current account status and permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Role</span>
                  <Badge variant={userProfile.data?.role === 'admin' ? 'default' : 'outline'}>
                    {userProfile.data?.role}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Registration Status</span>
                  <Badge variant={userProfile.data?.registration_status === 'approved' ? 'default' : 'secondary'}>
                    {userProfile.data?.registration_status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Training Status</span>
                  <Badge variant={userProfile.data?.training_status === 'completed' ? 'default' : 'outline'}>
                    {userProfile.data?.training_status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Access Status</span>
                  <Badge variant={userProfile.data?.access_blocked ? 'destructive' : 'default'}>
                    {userProfile.data?.access_blocked ? 'Blocked' : 'Active'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Member Since</span>
                  <span className="text-sm text-gray-600">
                    {new Date(userProfile.data?.created_at || '').toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userPreferences.data && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="email_notifications">Email Notifications</Label>
                      <p className="text-sm text-gray-600">Receive notifications via email</p>
                    </div>
                    <Switch
                      id="email_notifications"
                      checked={userPreferences.data.email_notifications}
                      onCheckedChange={(checked) => handlePreferencesUpdate('email_notifications', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Push Notifications</Label>
                      <p className="text-sm text-gray-600">Receive browser push notifications</p>
                    </div>
                    <PushNotificationToggle />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="daily_report_reminders">Daily Report Reminders</Label>
                      <p className="text-sm text-gray-600">Get reminded to submit daily reports</p>
                    </div>
                    <Switch
                      id="daily_report_reminders"
                      checked={userPreferences.data.daily_report_reminders}
                      onCheckedChange={(checked) => handlePreferencesUpdate('daily_report_reminders', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="lead_assignment_alerts">Lead Assignment Alerts</Label>
                      <p className="text-sm text-gray-600">Notify when new leads are assigned</p>
                    </div>
                    <Switch
                      id="lead_assignment_alerts"
                      checked={userPreferences.data.lead_assignment_alerts}
                      onCheckedChange={(checked) => handlePreferencesUpdate('lead_assignment_alerts', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="payment_notifications">Payment Notifications</Label>
                      <p className="text-sm text-gray-600">Get notified about payment updates</p>
                    </div>
                    <Switch
                      id="payment_notifications"
                      checked={userPreferences.data.payment_notifications}
                      onCheckedChange={(checked) => handlePreferencesUpdate('payment_notifications', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="weekly_summary">Weekly Summary</Label>
                      <p className="text-sm text-gray-600">Receive weekly performance summary</p>
                    </div>
                    <Switch
                      id="weekly_summary"
                      checked={userPreferences.data.weekly_summary}
                      onCheckedChange={(checked) => handlePreferencesUpdate('weekly_summary', checked)}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Lock className="w-5 h-5 mr-2" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="current_password">Current Password</Label>
                  <Input
                    id="current_password"
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, current_password: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                  />
                </div>
                {passwordError ? (
                  <p className="text-sm text-destructive" role="alert">{passwordError}</p>
                ) : null}
                {changePassword.isSuccess ? (
                  <p className="text-sm text-green-600" role="status">Password changed successfully.</p>
                ) : null}
                <Button onClick={handlePasswordChange} disabled={changePassword.isPending}>
                  {changePassword.isPending ? 'Changing...' : 'Change Password'}
                </Button>
              </CardContent>
            </Card>

            {/* Change Email */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Change Email
                </CardTitle>
                <CardDescription>
                  Update your email address
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="new_email">New Email</Label>
                  <Input
                    id="new_email"
                    type="email"
                    value={emailForm.new_email}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, new_email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email_password">Current Password</Label>
                  <Input
                    id="email_password"
                    type="password"
                    value={emailForm.current_password}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, current_password: e.target.value }))}
                  />
                </div>
                <Button onClick={handleEmailChange} disabled={changeEmail.isPending}>
                  {changeEmail.isPending ? 'Changing...' : 'Change Email'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* System Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="system" className="space-y-6">
            {/* Users Summary */}
            {usersSummary.data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Users Summary
                  </CardTitle>
                  <CardDescription>
                    Overview of all users in the system
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{usersSummary.data.total_users}</div>
                      <div className="text-sm text-gray-600">Total Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{usersSummary.data.blocked_users}</div>
                      <div className="text-sm text-gray-600">Blocked Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{usersSummary.data.by_role.admin || 0}</div>
                      <div className="text-sm text-gray-600">Admins</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{usersSummary.data.by_role.leader || 0}</div>
                      <div className="text-sm text-gray-600">Leaders</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Feature Flags */}
            {systemConfig.data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <SettingsIcon className="w-5 h-5 mr-2" />
                    Feature Flags
                  </CardTitle>
                  <CardDescription>
                    Enable or disable system features
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(systemConfig.data.feature_flags).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <Label htmlFor={key}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
                        <p className="text-sm text-gray-600">Toggle {key} feature</p>
                      </div>
                      <Switch
                        id={key}
                        checked={value}
                        onCheckedChange={(checked) => updateSystemConfig.mutate({ [key]: checked })}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* Advanced Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="advanced" className="space-y-6">
            {/* App Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  Application Settings
                </CardTitle>
                <CardDescription>
                  Manage application configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add New Setting */}
                <div className="space-y-4">
                  <h4 className="font-medium">Add New Setting</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Key"
                      value={newSetting.key}
                      onChange={(e) => { setNewSetting(prev => ({ ...prev, key: e.target.value })); setSettingError(null) }}
                    />
                    <Input
                      placeholder="Value"
                      value={newSetting.value}
                      onChange={(e) => { setNewSetting(prev => ({ ...prev, value: e.target.value })); setSettingError(null) }}
                    />
                    <Button onClick={handleAppSettingUpdate} disabled={updateAppSetting.isPending}>
                      Add
                    </Button>
                  </div>
                  {settingError ? (
                    <p className="text-sm text-destructive" role="alert">{settingError}</p>
                  ) : null}
                </div>

                {/* Existing Settings */}
                {appSettings.data && (
                  <div className="space-y-4">
                    <h4 className="font-medium">Current Settings</h4>
                    <div className="space-y-2">
                      {Object.entries(appSettings.data.settings).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <div className="font-medium">{key}</div>
                            <div className="text-sm text-gray-600">{String(value)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {deleteConfirmKey === key ? (
                              <>
                                <span className="text-xs text-muted-foreground">Sure?</span>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => handleAppSettingDelete(key)}
                                  disabled={deleteAppSetting.isPending}
                                >
                                  Yes, delete
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeleteConfirmKey(null)}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleAppSettingDelete(key)}
                                disabled={deleteAppSetting.isPending}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
