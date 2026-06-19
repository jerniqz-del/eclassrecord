package com.example.eclassrecordmobile.data

import kotlinx.serialization.Serializable

@Serializable
data class SyncPayload(
    val teacherName: String = "",
    val schoolName: String = "",
    val schoolYear: String = "",
    val assignments: List<Assignment> = emptyList()
)

@Serializable
data class Assignment(
    val id: String,
    val gradeLevel: String,
    val section: String,
    val subject: String,
    val subjectGroup: String = "",
    val policy: String = "",
    val schoolYear: String = "",
    val learners: List<Learner> = emptyList(),
    val assessments: List<Assessment> = emptyList(),
    val scores: Map<String, String> = emptyMap() // key: "learnerId|assessmentId", value: score string
)

@Serializable
data class Learner(
    val id: String,
    val name: String,
    val sex: String,
    val lrn: String = ""
)

@Serializable
data class Assessment(
    val id: String,
    val term: String,
    val component: String,
    val title: String,
    val maxScore: String,
    val date: String = "",
    val mapePart: String? = null
)
