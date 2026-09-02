!macro customInstall
  DetailPrint "Configuring authenticated local-sync access..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="E-Class Record Local Sync (TCP)"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="E-Class Record Discovery (UDP)"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="E-Class Record Local Sync (TCP)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any protocol=TCP localport=38473 remoteip=LocalSubnet'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="E-Class Record Discovery (UDP)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any protocol=UDP localport=38472 remoteip=LocalSubnet'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="E-Class Record Local Sync (TCP)"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="E-Class Record Discovery (UDP)"'
!macroend
