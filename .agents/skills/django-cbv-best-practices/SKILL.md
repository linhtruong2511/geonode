---
name: django-cbv-best-practices
description: best practices for django class-based views in mvt applications. use when creating, reviewing, refactoring, or standardizing django views, especially crud flows, authentication, permissions, queryset scoping, related objects, transactions, pagination, and performance optimization.
---

# Django CBV Best Practices

Use this skill to produce Django views that are secure, maintainable, testable, and efficient.
Default to generic class-based views and thin orchestration in the view layer.

## Default behavior

1. Identify the task:
   - **Create new views** for CRUD or nested resources
   - **Review or refactor** an existing view
   - **Fix performance issues** such as N+1 queries, large querysets, or repeated lookups
   - **Harden security** with authentication, authorization, and queryset scoping

2. Prefer the smallest correct abstraction:
   - Use Django generic CBVs before writing custom `View`
   - Keep business rules in models, forms, selectors, or services rather than the view body
   - Use mixins only when they reduce duplication without hiding important behavior

3. Be explicit about assumptions when details are missing:
   - app name
   - model names
   - form names
   - URL names
   - ownership rules or permission model

4. Return code that is ready to paste, with imports and brief notes only where they prevent ambiguity.

## Implementation rules

### Choose the right base view

- Use `ListView` for collection pages
- Use `DetailView` for single-object pages
- Use `CreateView` and `UpdateView` for forms backed by a model
- Use `DeleteView` for confirmed deletion flows
- Use plain `View`, `TemplateView`, or a custom mixin stack only when generic editing or display views are a poor fit

When a user asks for full CRUD, provide `ListView`, `DetailView`, `CreateView`, `UpdateView`, and `DeleteView` unless there is a strong reason not to.

### Authentication and authorization

- Add `LoginRequiredMixin` to authenticated views by default
- Add `PermissionRequiredMixin` when the app uses Django permissions
- Scope object access through `get_queryset()` for owner-based access control
- Never rely only on template visibility or form field hiding for authorization
- For update, detail, and delete flows, make the queryset itself enforce tenant, organization, or owner boundaries

Prefer this pattern:
- `get_queryset()` limits what the current user may access
- `dispatch()` or `test_func()` is used only when access cannot be cleanly expressed in the queryset

### Queryset design

- Override `get_queryset()` instead of fetching unrestricted objects in multiple methods
- Centralize filtering, visibility, ordering, and eager loading in `get_queryset()`
- Use custom queryset methods or managers when the same filtering logic appears repeatedly
- Keep queryset logic deterministic and side-effect free

When data is user-scoped, default to something like:

```python
class ProjectQuerySet(models.QuerySet):
    def visible_to(self, user):
        if user.is_superuser:
            return self
        return self.filter(owner=user)
```

Then use that queryset method from the view.

### Performance defaults

- Use `select_related()` for single-valued joins used by the template or serializer
- Use `prefetch_related()` for reverse and many-to-many relations
- Use `annotate()` for counts or aggregates needed in the UI instead of per-row queries
- Paginate list views unless the dataset is known to be small
- Avoid expensive work in `get_context_data()` when it belongs in the queryset
- Do not perform repeated database lookups across `dispatch()`, `get_context_data()`, and `form_valid()` for the same object
- Use `only()` or `defer()` sparingly and only when the accessed fields are well understood

Consult [references/performance-and-review.md](references/performance-and-review.md) when optimizing or reviewing view performance.

### Forms and save flow

- Use `form_valid()` to set derived fields such as `created_by`, `updated_by`, or URL-scoped parent relationships
- Use `get_form_kwargs()` when the form needs the current user or another runtime dependency
- Use `get_initial()` only for user-editable defaults, not for enforcing trusted relationships
- Wrap multi-object writes in `transaction.atomic()` when consistency matters
- Use `select_for_update()` for state transitions that must be serialized

### Parent-child and nested resources

For nested routes like `/projects/<project_id>/tasks/add/`:

- Load the parent once
- Check access at parent-queryset level
- Attach the parent in `form_valid()` rather than trusting submitted form data
- Reuse the loaded parent in context and redirect logic

Consult [references/cbv-patterns.md](references/cbv-patterns.md) for standard nested-resource patterns.

### Template and URL conventions

Default to clear, conventional names unless the user requests otherwise:

- template paths: `app_name/index.html`, `app_name/detail.html`, `app_name/add.html`, `app_name/update.html`, `app_name/delete.html`
- URL names: `app_name:index`, `app_name:detail`, `app_name:add`, `app_name:update`, `app_name:delete`
- use `context_object_name` for list and detail views when it improves readability
- use `reverse_lazy()` for class attributes and `get_success_url()` when the redirect depends on the saved object

### Clean code rules

- Keep views thin; orchestrate request/response flow only
- Move business decisions to domain methods, forms, services, selectors, or model/queryset helpers
- Avoid duplicating permission, filtering, and parent-loading logic across methods
- Prefer descriptive class names such as `InvoiceListView` over vague names such as `Index`
- Keep method overrides short and purposeful
- When overriding a method, do the minimum work necessary and delegate the rest to `super()` where appropriate

### Deletion strategy

- Use `DeleteView` for hard deletes with confirmation pages
- If the domain uses soft delete, do not call `delete()` directly from the view without noting the domain rule
- For soft delete, prefer a model or service method such as `archive()` or `soft_delete()` and call it from a small custom `post()` flow or a dedicated action view

### Messages and UX

- Use `SuccessMessageMixin` when it improves UX and the project already uses Django messages
- Keep success messages short and domain-specific
- Preserve filter state or parent context in redirects when that is important to user flow

### Testing expectations

When asked to generate or refactor a view, mention the highest-value tests if relevant:

- authenticated vs anonymous access
- authorized vs unauthorized object access
- queryset scoping for the current user
- successful create/update/delete flow
- redirect target correctness
- query count or eager loading expectations for slow pages

## Output format

### When creating new views

Return in this order when helpful:

1. brief assumptions
2. imports
3. view code
4. optional notes about expected model/queryset/form helpers

### When reviewing existing code

Return in this order:

1. key issues grouped by security, correctness, performance, and maintainability
2. revised implementation
3. concise explanation of the main changes

## Anti-patterns to avoid

- Fetching unrestricted objects with `Model.objects.get()` in multiple methods
- Using `get_initial()` to enforce a trusted foreign key from the URL
- Doing per-object related queries inside templates or loops
- Putting core business logic directly in `get_context_data()` or `post()`
- Using `LoginRequiredMixin` without owner or permission scoping for private data
- Recomputing the same parent or target object across request methods
- Returning huge unpaginated list views by default
- Hiding an unauthorized form field while still trusting posted data

## Example user requests this skill should handle well

- "Create Django CBVs for project CRUD with owner-based access control"
- "Refactor this function-based view into clean CBVs"
- "Review this UpdateView for security and performance issues"
- "Build a nested TaskCreateView under Project with proper parent scoping"
- "Optimize this ListView to remove N+1 queries"

## References

- Standard implementations and skeletons: [references/cbv-patterns.md](references/cbv-patterns.md)
- Performance checklist and review rubric: [references/performance-and-review.md](references/performance-and-review.md)
