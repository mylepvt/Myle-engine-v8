import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Lock, Mail, Shield, User } from 'lucide-react'

import { PushNotificationToggle } from '@/components/notifications/PushNotificationToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  useAvatarUploadMutation,
  useEmailChangeMutation,
  usePasswordChangeMutation,
  useUserPreferencesQuery,
  useUserPreferencesUpdateMutation,
  useUserProfileQuery,
  useUserProfileUpdateMutation,
} from '@/hooks/use-settings-query'
import { apiUrl } from '@/lib/api'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const { data: authData } = useAuthMeQuery()
  const isAdmin = authData?.role === 'admin'

  const userProfile = useUserProfileQuery()
  const userPreferences = useUserPreferencesQuery()

  const updateProfile = useUserProfileUpdateMutation()
  const updatePreferences = useUserPreferencesUpdateMutation()
  const changePassword = usePasswordChangeMutation()
  const changeEmail = useEmailChangeMutation()
  const avatarUpload = useAvatarUploadMutation()

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
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (!userProfile.data) return
    setProfileForm({
      username: userProfile.data.username || '',
      phone: userProfile.data.phone || '',
      name: userProfile.data.name || '',
    })
  }, [userProfile.data])

  const handleProfileUpdate = () => {
    setProfileSuccess(null)
    setProfileError(null)
    updateProfile.mutate(profileForm, {
      onSuccess: () => setProfileSuccess('Profile updated successfully.'),
      onError: (error) =>
        setProfileError(error instanceof Error ? error.message : 'Update failed.'),
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
        setPasswordForm({
          current_password: '',
          new_password: '',
          confirm_password: '',
        })
        setPasswordError(null)
      },
      onError: (error) =>
        setPasswordError(error instanceof Error ? error.message : 'Password change failed.'),
    })
  }

  const handleEmailChange = () => {
    changeEmail.mutate(emailForm)
  }

  const handlePreferencesUpdate = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value })
  }

  const createdAt = userProfile.data?.created_at
  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString() : '--'

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile, preferences, and account security.
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {authData?.role?.toUpperCase() ?? '--'}
        </Badge>
      </div>

      {isAdmin ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Profile page cleaned up</p>
              <p className="text-sm text-muted-foreground">
                App, video, and WhatsApp links <span className="font-medium text-foreground">General</span> me
                rakhe gaye hain. Yahan sirf personal account settings rahengi.
              </p>
            </div>
            <Link
              to="/dashboard/settings/app"
              className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-background/70 px-3 py-2 text-sm font-medium text-primary hover:bg-background"
            >
              Open General
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger value="profile" className="min-h-9">
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="min-h-9">
            Preferences
          </TabsTrigger>
          <TabsTrigger value="security" className="min-h-9">
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <User className="mr-2 h-5 w-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
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
                        const file = e.target.files?.[0]
                        if (file) avatarUpload.mutate(file)
                        e.target.value = ''
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-600 dark:text-muted-foreground">
                      JPEG, PNG, or WebP. Max 2 MB.
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
                  <Input id="fbo_id" value={userProfile.data?.fbo_id || '--'} disabled className="bg-muted/40 text-muted-foreground" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={userProfile.data?.email || '--'} disabled className="bg-muted/40 text-muted-foreground" />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={profileForm.username}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <Button onClick={handleProfileUpdate} disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
                </Button>
                {profileSuccess ? <p className="text-sm text-emerald-500" role="status">{profileSuccess}</p> : null}
                {profileError ? <p className="text-sm text-destructive" role="alert">{profileError}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Shield className="mr-2 h-5 w-5" />
                  Account Status
                </CardTitle>
                <CardDescription>Your current account status and permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Role</span>
                  <Badge variant={userProfile.data?.role === 'admin' ? 'default' : 'outline'}>
                    {userProfile.data?.role ?? '--'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Registration Status</span>
                  <Badge variant={userProfile.data?.registration_status === 'approved' ? 'default' : 'secondary'}>
                    {userProfile.data?.registration_status ?? '--'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Training Status</span>
                  <Badge variant={userProfile.data?.training_status === 'completed' ? 'default' : 'outline'}>
                    {userProfile.data?.training_status ?? '--'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Access Status</span>
                  <Badge variant={userProfile.data?.access_blocked ? 'destructive' : 'default'}>
                    {userProfile.data?.access_blocked ? 'Blocked' : 'Active'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Member Since</span>
                  <span className="text-sm text-gray-600">{memberSince}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Bell className="mr-2 h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose how you want to receive notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userPreferences.data ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="email_notifications">Email Notifications</Label>
                      <p className="text-sm text-gray-600">Receive notifications via email.</p>
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
                      <p className="text-sm text-gray-600">Receive browser push notifications.</p>
                    </div>
                    <PushNotificationToggle />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="daily_report_reminders">Daily Report Reminders</Label>
                      <p className="text-sm text-gray-600">Get reminded to submit daily reports.</p>
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
                      <p className="text-sm text-gray-600">Notify when new leads are assigned.</p>
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
                      <p className="text-sm text-gray-600">Get notified about payment updates.</p>
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
                      <p className="text-sm text-gray-600">Receive weekly performance summary.</p>
                    </div>
                    <Switch
                      id="weekly_summary"
                      checked={userPreferences.data.weekly_summary}
                      onCheckedChange={(checked) => handlePreferencesUpdate('weekly_summary', checked)}
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Lock className="mr-2 h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your account password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="current_password">Current Password</Label>
                  <Input
                    id="current_password"
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
                  />
                </div>
                {passwordError ? <p className="text-sm text-destructive" role="alert">{passwordError}</p> : null}
                {changePassword.isSuccess ? (
                  <p className="text-sm text-green-600" role="status">Password changed successfully.</p>
                ) : null}
                <Button onClick={handlePasswordChange} disabled={changePassword.isPending}>
                  {changePassword.isPending ? 'Changing...' : 'Change Password'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Mail className="mr-2 h-5 w-5" />
                  Change Email
                </CardTitle>
                <CardDescription>Update your email address.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="new_email">New Email</Label>
                  <Input
                    id="new_email"
                    type="email"
                    value={emailForm.new_email}
                    onChange={(e) => setEmailForm((prev) => ({ ...prev, new_email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email_password">Current Password</Label>
                  <Input
                    id="email_password"
                    type="password"
                    value={emailForm.current_password}
                    onChange={(e) => setEmailForm((prev) => ({ ...prev, current_password: e.target.value }))}
                  />
                </div>
                <Button onClick={handleEmailChange} disabled={changeEmail.isPending}>
                  {changeEmail.isPending ? 'Changing...' : 'Change Email'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
