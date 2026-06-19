package com.example.eclassrecordmobile

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object Main : NavKey
@Serializable data class ClassDetail(val assignmentId: String) : NavKey
@Serializable data class ScoreEntry(val assignmentId: String, val assessmentId: String) : NavKey
@Serializable data object Sync : NavKey
