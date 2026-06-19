package com.example.eclassrecordmobile

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.eclassrecordmobile.ui.ClassDetailScreen
import com.example.eclassrecordmobile.ui.ScoreEntryScreen
import com.example.eclassrecordmobile.ui.SyncScreen
import com.example.eclassrecordmobile.ui.main.MainScreen

@Composable
fun MainNavigation() {
  val backStack = rememberNavBackStack(Main)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<Main> {
          MainScreen(onNavigate = { navKey -> backStack.add(navKey) })
        }
        entry<ClassDetail> { key ->
          ClassDetailScreen(
            assignmentId = key.assignmentId,
            onBack = { backStack.removeLastOrNull() },
            onNavigate = { navKey -> backStack.add(navKey) }
          )
        }
        entry<ScoreEntry> { key ->
          ScoreEntryScreen(
            assignmentId = key.assignmentId,
            assessmentId = key.assessmentId,
            onBack = { backStack.removeLastOrNull() }
          )
        }
        entry<Sync> {
          SyncScreen(onBack = { backStack.removeLastOrNull() })
        }
      },
  )
}
