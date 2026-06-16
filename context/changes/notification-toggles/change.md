---
change_id: notification-toggles
title: Notification toggles
status: impl_reviewed
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

 Email Notifications tile (frontend-only, no backend changes)                                                         
                                                                                                                       
  1. Add emailEnabled local state to EmailNotificationsTile, initialized from profile.email_reminders_enabled          
  2. Render a toggle switch at the top of the tile, above the checkboxes                                               
  3. When toggled off, dim/disable all child controls (checkboxes, send-hour selector, send-now button)                
  4. Include emailEnabled in the isDirty check and save() / cancel() cycle — consistent with existing save pattern     
  5. Update the "Send notification now" disabled condition to use local emailEnabled (not                              
  profile.email_reminders_enabled) so the button tracks unsaved state                                                  
                                                                                                                       
  Browser Notifications tile (frontend-only, localStorage)                                                             
                                                                                                                       
  1. Add browser_notif_enabled key to localStorage (boolean; set "1" on first permission grant; default true if key    
  absent but permission is granted)                                                                                    
  2. Extend useNotifications with isEnabled: boolean and setEnabled(v: boolean) — notifyDueToday early-returns if      
  !isEnabled                                                                                                           
  3. In BrowserNotificationsTile: when permission === "granted", show a toggle switch using isEnabled / setEnabled     
  instead of (or alongside) the current green checkmark                                                                
  4. Toggling off immediately updates localStorage — no dirty/save cycle needed (client preference only)               
                                                                                                                       
  Translations needed                                                                                                  
                                                                                                                       
  Both en.json, pl.json, de.json:                                                                                      
  - emailNotifications.masterToggle — label for the enable/disable switch                                              
  - browserNotifications.toggle — label for the enable/disable switch                                                  
