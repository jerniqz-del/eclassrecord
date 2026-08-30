package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

@Serializable
data class PersonalChecklistItem(
    val id: String,
    val category: String,
    val title: String,
    val completed: Boolean = false,
)

@Serializable
data class PersonalChecklist(
    val categories: List<String> = emptyList(),
    val items: List<PersonalChecklistItem> = emptyList(),
)

class PersonalChecklistRepository(context: Context) {
    private val file = File(context.filesDir, "personal_performance_checklist.json")
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    fun load(): PersonalChecklist = runCatching {
        if (!file.exists()) return PersonalChecklist()
        val stored = SecureFileStore.readText(file)
        val checklist = json.decodeFromString<PersonalChecklist>(stored.text).normalized()
        if (stored.wasPlaintext) save(checklist)
        checklist
    }.getOrDefault(PersonalChecklist())

    fun add(category: String, title: String): PersonalChecklist {
        val normalizedCategory = category.trim()
        val normalizedTitle = title.trim()
        require(normalizedCategory.isNotBlank()) { "Enter a category." }
        require(normalizedTitle.isNotBlank()) { "Enter a checklist item." }
        require(normalizedCategory.length <= 80) { "Category is too long." }
        require(normalizedTitle.length <= 180) { "Checklist item is too long." }

        val current = load()
        val storedCategory = current.categories.firstOrNull {
            it.equals(normalizedCategory, ignoreCase = true)
        } ?: normalizedCategory
        require(current.items.size < 500) { "Personal checklist limit reached." }
        return current.copy(
            categories = (current.categories + storedCategory).distinct(),
            items = current.items + PersonalChecklistItem(
                id = UUID.randomUUID().toString(),
                category = storedCategory,
                title = normalizedTitle,
            ),
        ).also(::save)
    }

    fun setCompleted(id: String, completed: Boolean): PersonalChecklist {
        val current = load()
        return current.copy(
            items = current.items.map { item -> if (item.id == id) item.copy(completed = completed) else item },
        ).also(::save)
    }

    fun delete(id: String): PersonalChecklist {
        val current = load()
        return current.copy(items = current.items.filterNot { it.id == id }).normalized().also(::save)
    }

    private fun save(checklist: PersonalChecklist) {
        SecureFileStore.writeText(file, json.encodeToString(checklist.normalized()))
    }

    private fun PersonalChecklist.normalized(): PersonalChecklist {
        val validItems = items.filter {
            it.id.isNotBlank() && it.category.isNotBlank() && it.title.isNotBlank()
        }.distinctBy { it.id }.take(500)
        return copy(
            categories = (categories.map(String::trim).filter(String::isNotBlank) +
                validItems.map(PersonalChecklistItem::category)).distinct(),
            items = validItems,
        )
    }
}

